import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { bunqConnections, bunqPaymentProgress, workerHeartbeats } from '../db/schema';
import { createOAuthAttempt } from './bunqOAuthAttempts';
import { clearBunqTestEnv, setBunqTestEnv } from '../test/bunq';
import { createIntegrationHelpers } from '../test/integration';
import { syncBunqSavings } from '../services/bunqSavingsSync';
import { syncBunqBudget } from '../services/bunqBudgetSync';
import { syncPaymentBatch } from './bunqPaymentProgress';
import { runScheduledJob } from './scheduledJob';
import { YahooFinanceMarketDataClient } from './yahooFinanceClient';
import * as marketDataClient from './marketDataClient';
import { syncAllHoldingPrices } from './holdingPriceSync';

const integration = createIntegrationHelpers('review-timeout.quro.test');
const originalFetch = globalThis.fetch;
beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());
beforeEach(setBunqTestEnv);
afterEach(() => {
  clearBunqTestEnv();
  globalThis.fetch = originalFetch;
  mock.restore();
});

for (const [kind, sync] of [
  ['savings', syncBunqSavings],
  ['budget', syncBunqBudget],
] as const) {
  test(`${kind} job deadline clears syncing status with a bounded failure write`, async () => {
    const auth = await integration.signUp(`failure-${kind}`);
    const name = `review-${kind}-${crypto.randomUUID()}`;
    await db.insert(bunqConnections).values({
      userId: auth.user.id,
      accessToken: 'synthetic',
      sessionToken: 'synthetic',
      sessionId: 1,
      sessionExpiresAt: new Date(Date.now() + 60_000),
      bunqUserId: '42',
    });
    globalThis.fetch = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    try {
      await expect(
        runScheduledJob(
          name,
          60_000,
          async () => {
            await sync(auth.user.id);
          },
          100,
        ),
      ).rejects.toThrow();
      const [connection] = await db
        .select()
        .from(bunqConnections)
        .where(eq(bunqConnections.userId, auth.user.id));
      expect(connection.syncStatus).toBe('error');
      expect(connection.syncError).toContain('deadline exceeded');
    } finally {
      await db.delete(bunqConnections).where(eq(bunqConnections.userId, auth.user.id));
      await db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerName, `scheduler:${name}`));
    }
  });
}

test('101 pages make durable progress without gaps, and failed imports replay their batch', async () => {
  const auth = await integration.signUp('large-history');
  const imported = new Set<number>();
  let firstPage = -1;
  globalThis.fetch = mock((url: unknown) => {
    const page = Number(new URL(String(url)).searchParams.get('page') ?? 0);
    if (firstPage < 0) firstPage = page;
    return Promise.resolve(
      Response.json({
        Response: [
          ...Array.from({ length: 200 }, (_, offset) => ({
            Payment: {
              id: page * 200 + offset + 1,
              created: '2026-01-03 12:00:00.000000',
              amount: { value: '1.00', currency: 'EUR' },
            },
          })),
          { Pagination: { older_url: page < 100 ? `/v1/user/42/payment?page=${page + 1}` : null } },
        ],
      }),
    );
  }) as unknown as typeof fetch;
  const input = {
    userId: auth.user.id,
    accountId: 7,
    kind: 'savings' as const,
    sessionToken: 'synthetic',
    bunqUserId: '42',
    newerThan: undefined,
    lastSyncAt: null,
    importPayments: (payments: { id: number }[]) => {
      for (const payment of payments) imported.add(payment.id);
      return Promise.resolve([]);
    },
  };
  const first = await syncPaymentBatch(input);
  expect(first.issues[0]?.message).toContain('next sync');
  expect(imported.size).toBe(20_000);
  const [checkpoint] = await db
    .select()
    .from(bunqPaymentProgress)
    .where(eq(bunqPaymentProgress.userId, auth.user.id));
  expect(checkpoint.nextPageUrl).toContain('page=100');
  firstPage = -1;
  const failed = await syncPaymentBatch({
    ...input,
    importPayments: () => Promise.resolve([{ message: 'synthetic import failure' }]),
  });
  expect(failed.issues).toHaveLength(1);
  expect(firstPage).toBe(100);
  firstPage = -1;
  const second = await syncPaymentBatch(input);
  expect(firstPage).toBe(100);
  expect(second.issues).toHaveLength(0);
  expect(second.syncedAt).toEqual(first.syncedAt);
  expect(imported.size).toBe(20_200);
  firstPage = -1;
  await syncPaymentBatch(input);
  expect(firstPage).toBe(-1); // Completed accounts wait while another account finishes.
  await syncPaymentBatch({
    ...input,
    lastSyncAt: second.syncedAt,
    newerThan: '2026-02-01T00:00:00Z',
  });
  expect(firstPage).toBe(0); // Advancing the shared timestamp starts the next incremental scan.
});

test('hard grace destroys a stuck job pool and a later run can acquire its lock', async () => {
  const name = `hard-grace-${crypto.randomUUID()}`;
  let resume: () => void = () => {};
  let lateWrites = 0;
  await expect(
    runScheduledJob(
      name,
      60_000,
      async () => {
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
        await db
          .insert(workerHeartbeats)
          .values({ workerName: 'late-review-write', status: 'idle', lastHeartbeatAt: new Date() });
        lateWrites += 1;
      },
      30,
      40,
    ),
  ).rejects.toThrow('grace period exceeded');
  resume();
  await Bun.sleep(30);
  expect(lateWrites).toBe(0);
  try {
    let retried = false;
    await runScheduledJob(name, 60_000, () => {
      retried = true;
      return Promise.resolve();
    });
    expect(retried).toBe(true);
  } finally {
    await db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerName, `scheduler:${name}`));
  }
});

test('Yahoo per-call timeout escapes price-sync catches and leaves no successful heartbeat', async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(20));
  const client = new YahooFinanceMarketDataClient(
    () => ({ quote: () => new Promise(() => {}) }) as never,
  );
  spyOn(marketDataClient, 'getMarketDataClient').mockReturnValue(client);
  const auth = await integration.signUp('yahoo-price-timeout');
  const { holdings } = await import('../db/schema');
  await db.insert(holdings).values({
    userId: auth.user.id,
    name: 'Synthetic',
    ticker: 'SYNTHETIC',
    sector: 'Test',
    currentPrice: 1,
    currency: 'EUR',
  });
  const name = `yahoo-timeout-${crypto.randomUUID()}`;
  await expect(
    runScheduledJob(
      name,
      60_000,
      async () => {
        await syncAllHoldingPrices();
      },
      1000,
    ),
  ).rejects.toThrow();
  expect(
    await db
      .select()
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.workerName, `scheduler:${name}`)),
  ).toHaveLength(0);
});

test('a job deadline retains the last imported page instead of restarting the capped batch', async () => {
  const auth = await integration.signUp('page-deadline');
  const name = `page-progress-${crypto.randomUUID()}`;
  let imported = 0;
  let requested = '';
  globalThis.fetch = ((url: unknown) => {
    requested = String(url);
    if (requested.includes('page=1')) return new Promise<Response>(() => {});
    return Promise.resolve(
      Response.json({
        Response: [
          {
            Payment: {
              id: 1,
              created: '2026-01-01 12:00:00.000000',
              amount: { value: '1', currency: 'EUR' },
            },
          },
          { Pagination: { older_url: '/v1/user/42/payment?page=1' } },
        ],
      }),
    );
  }) as unknown as typeof fetch;
  const input = {
    userId: auth.user.id,
    accountId: 7,
    kind: 'savings' as const,
    sessionToken: 'synthetic',
    bunqUserId: '42',
    newerThan: undefined,
    lastSyncAt: null,
    importPayments: (payments: unknown[]) => {
      imported += payments.length;
      return Promise.resolve([]);
    },
  };
  await expect(
    runScheduledJob(
      name,
      60_000,
      async () => {
        await syncPaymentBatch(input);
      },
      100,
    ),
  ).rejects.toThrow();
  const [checkpoint] = await db
    .select()
    .from(bunqPaymentProgress)
    .where(eq(bunqPaymentProgress.userId, auth.user.id));
  expect(checkpoint.nextPageUrl).toContain('page=1');
  expect(imported).toBe(1);
  globalThis.fetch = ((url: unknown) => {
    requested = String(url);
    return Promise.resolve(Response.json({ Response: [] }));
  }) as unknown as typeof fetch;
  expect((await syncPaymentBatch(input)).issues).toHaveLength(0);
  expect(requested).toContain('page=1');
  expect(imported).toBe(1);
});

test('hard cleanup rolls back a transaction whose callback never settles', async () => {
  const name = `stuck-transaction-${crypto.randomUUID()}`;
  const rowName = `uncommitted-${crypto.randomUUID()}`;
  let resume: () => void = () => {};
  await expect(
    runScheduledJob(
      name,
      60_000,
      () =>
        db.transaction(async (tx) => {
          await tx
            .insert(workerHeartbeats)
            .values({ workerName: rowName, status: 'idle', lastHeartbeatAt: new Date() });
          await new Promise<void>((resolve) => {
            resume = resolve;
          });
        }),
      100,
      100,
    ),
  ).rejects.toThrow();
  resume();
  await Bun.sleep(30);
  expect(
    await db.select().from(workerHeartbeats).where(eq(workerHeartbeats.workerName, rowName)),
  ).toHaveLength(0);
  try {
    let retried = false;
    await runScheduledJob(name, 60_000, () => {
      retried = true;
      return Promise.resolve();
    });
    expect(retried).toBe(true);
  } finally {
    await db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerName, `scheduler:${name}`));
  }
});

test('reconnecting bunq discards checkpoints from the previous provider connection', async () => {
  const auth = await integration.signUp('reconnect');
  await db.insert(bunqPaymentProgress).values({
    userId: auth.user.id,
    accountId: 7,
    kind: 'savings',
    nextPageUrl: '/v1/user/old/payment?page=1',
    startedAt: new Date(),
  });
  globalThis.fetch = (() =>
    Promise.resolve(Response.json({ access_token: 'synthetic' }))) as unknown as typeof fetch;
  try {
    const state = await createOAuthAttempt(auth.user.id, 'settings');
    const response = await integration.request(
      `/api/bunq/oauth/callback?code=synthetic&state=${encodeURIComponent(state)}`,
    );
    expect(response.headers.get('location')).toContain('connected');
    expect(
      await db
        .select()
        .from(bunqPaymentProgress)
        .where(eq(bunqPaymentProgress.userId, auth.user.id)),
    ).toHaveLength(0);
  } finally {
    await db.delete(bunqConnections).where(eq(bunqConnections.userId, auth.user.id));
  }
});
