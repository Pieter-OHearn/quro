import { afterAll, afterEach, beforeAll, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { bunqConnections, workerHeartbeats } from '../db/schema';
import { createIntegrationHelpers } from '../test/integration';
import { createOAuthAttempt } from './bunqOAuthAttempts';
import { clearBunqTestEnv, setBunqTestEnv } from '../test/bunq';
import { fetchMonetaryAccounts } from './bunqClient';
import { runScheduledJob } from './scheduledJob';
import * as marketDataClient from './marketDataClient';
import { YahooFinanceMarketDataClient } from './yahooFinanceClient';

const integration = createIntegrationHelpers('outbound-timeout.quro.test');
const originalFetch = globalThis.fetch;
beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());
beforeEach(setBunqTestEnv);
afterEach(() => {
  clearBunqTestEnv();
  globalThis.fetch = originalFetch;
  mock.restore();
});

function hangFetch() {
  let signal: AbortSignal | undefined;
  let finish: (response: Response) => void = () => {};
  globalThis.fetch = mock((_url: unknown, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  }) as unknown as typeof fetch;
  return { signal: () => signal, finish: (response: Response) => finish(response) };
}

function shortTimeout() {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(30));
}

test('bunq OAuth request responds on timeout and a late token cannot create a connection', async () => {
  const auth = await integration.signUp('oauth-timeout');
  shortTimeout();
  const { signal, finish } = hangFetch();
  const state = await createOAuthAttempt(auth.user.id, 'settings');
  const response = await integration.request(
    `/api/bunq/oauth/callback?code=synthetic&state=${encodeURIComponent(state)}`,
  );
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toContain('error');
  expect(signal()?.aborted).toBe(true);
  finish(Response.json({ access_token: 'synthetic-late-token' }));
  await Bun.sleep(20);
  const rows = await db
    .select()
    .from(bunqConnections)
    .where(eq(bunqConnections.userId, auth.user.id));
  expect(rows).toHaveLength(0);
});

test('Yahoo ticker lookup request returns its existing error response on timeout', async () => {
  const auth = await integration.signUp('yahoo-timeout');
  spyOn(marketDataClient, 'getMarketDataClient').mockReturnValue(
    new YahooFinanceMarketDataClient(),
  );
  shortTimeout();
  const { signal } = hangFetch();
  const response = await integration.request('/api/investments/ticker-lookup/SYNTHETIC', {
    cookie: auth.cookie,
  });
  expect(response.status).toBe(500);
  expect(signal()?.aborted).toBe(true);
});

test('real scheduled lock is released after bunq timeout and the next run succeeds', async () => {
  const name = `outbound-timeout-${crypto.randomUUID()}`;
  const key = `scheduler:${name}`;
  const { signal, finish } = hangFetch();
  let writes = 0;
  try {
    await expect(
      runScheduledJob(
        name,
        60_000,
        async () => {
          await fetchMonetaryAccounts('synthetic', '42');
          writes += 1;
        },
        30,
      ),
    ).rejects.toThrow('deadline exceeded');
    expect(signal()?.aborted).toBe(true);
    const heartbeat = await db
      .select()
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.workerName, key));
    expect(heartbeat).toHaveLength(0);
    finish(Response.json({ Response: [] }));
    await Bun.sleep(20);
    expect(writes).toBe(0);
    await runScheduledJob(name, 60_000, () => {
      writes += 1;
      return Promise.resolve();
    });
    expect(writes).toBe(1);
    const locks = await db.execute<{ count: number }>(
      sql`select count(*)::integer as count from pg_locks where locktype = 'advisory'`,
    );
    expect(locks[0].count).toBe(0);
  } finally {
    await db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerName, key));
  }
});

test('deadline cancels an active database query and releases the scheduler lock', async () => {
  const name = `query-timeout-${crypto.randomUUID()}`;
  await expect(
    runScheduledJob(
      name,
      60_000,
      async () => {
        await db.execute(sql`select pg_sleep(10)`);
      },
      30,
    ),
  ).rejects.toThrow();
  let retried = false;
  try {
    await runScheduledJob(name, 60_000, () => {
      retried = true;
      return Promise.resolve();
    });
    expect(retried).toBe(true);
  } finally {
    await db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerName, `scheduler:${name}`));
  }
});
