import { afterAll, beforeAll, describe, expect, mock, test, setDefaultTimeout } from 'bun:test';
import { eq } from 'drizzle-orm';
import { installProviderMocks } from '../test/providerMocks';

// The statement import job runs against an in-memory store and a canned parser, never a provider.
// These suites send hundreds of requests; the default 5 seconds is for single assertions.
setDefaultTimeout(60_000);

const providers = await installProviderMocks();
const realParser = { ...(await import('../lib/pensionParserClient')) };
await mock.module('../lib/pensionParserClient', () => ({
  parsePensionStatement: () =>
    Promise.resolve({
      statementPeriodStart: '2025-01-01',
      statementPeriodEnd: '2025-12-31',
      modelName: 'fixture-parser',
      modelVersion: '1.0.0',
      rows: [
        {
          type: 'annual_statement',
          amount: 12500,
          taxAmount: 0,
          date: '2025-12-31',
          note: 'annual statement fixture',
          isEmployer: null,
          confidence: 0.98,
          confidenceLabel: 'high',
          evidence: [],
          isDerived: false,
        },
      ],
    }),
}));

const { db } = await import('../db/client');
const {
  netWorthSnapshots,
  partnerLinks,
  pensionPots,
  pensionStatementImports,
  savingsAccounts,
  sessions,
} = await import('../db/schema');
const { hashSessionToken } = await import('../lib/sessions');
const { runSnapshots } = await import('../lib/netWorthSnapshotScheduler');
const { runPensionImportWorkerTick } = await import('./pension-imports');
const { createIntegrationHelpers, insertPartnerLink } = await import('../test/integration');
const { useFixtureCurrencyRates } = await import('../test/currencyRates');
import type { AuthSession } from '../test/integration';

const integration = createIntegrationHelpers('lifecycle.integration.quro.test');

beforeAll(async () => {
  await integration.cleanup();
  await useFixtureCurrencyRates('lifecycle');
});

afterAll(async () => {
  await providers.restore();
  await mock.module('../lib/pensionParserClient', () => realParser);
  await integration.cleanup();
});

type Json = Record<string, unknown>;

async function read(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

function tokenOf(cookie: string): string {
  return cookie.match(/session=([^;]+)/)![1]!;
}

async function sessionRow(cookie: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, hashSessionToken(tokenOf(cookie))));
  return row ?? null;
}

async function addAccount(owner: AuthSession, name: string, balance: number, isJoint: boolean) {
  const [row] = await db
    .insert(savingsAccounts)
    .values({
      userId: owner.user.id,
      name,
      bank: 'Synthetic',
      balance,
      currency: 'EUR',
      interestRate: 1,
      accountType: 'Savings',
      isJoint,
    })
    .returning();
  return row!.id;
}

async function savingsAllocation(user: AuthSession): Promise<number> {
  const response = await integration.request('/api/dashboard/allocations', { cookie: user.cookie });
  expect(response.status).toBe(200);
  const { data } = (await read(response)) as {
    data: { allocations: Array<{ key: string; value: number }> };
  };
  return data.allocations.find((item) => item.key === 'savings')?.value ?? 0;
}

async function accountNames(user: AuthSession): Promise<string[]> {
  const response = await integration.request('/api/savings/accounts', { cookie: user.cookie });
  const { data } = (await read(response)) as { data: Array<{ name: string }> };
  return data.map((account) => account.name).sort();
}

async function currentSnapshotTotal(user: AuthSession): Promise<number | null> {
  const rows = await db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, user.user.id));
  return rows.length === 0 ? null : Math.max(...rows.map((row) => row.savings));
}

describe('sign-out', () => {
  test('ends the session on the server at once and leaves other browsers alone', async () => {
    const owner = await integration.signUp('signout');
    const laptop = owner;
    const phone = await integration.signIn(owner.user.email);

    expect(await sessionRow(laptop.cookie)).not.toBeNull();
    const response = await integration.request('/api/auth/signout', {
      method: 'POST',
      cookie: laptop.cookie,
    });
    expect(response.status).toBe(200);

    // The browser is told to drop both cookies.
    const cleared = response.headers.getSetCookie().join('\n');
    expect(cleared).toMatch(/session=;[^\n]*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
    expect(cleared).toMatch(/csrf_token=;[^\n]*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);

    // Replaying the old cookie reads nothing and writes nothing.
    expect(await sessionRow(laptop.cookie)).toBeNull();
    for (const path of ['/api/savings/accounts', '/api/settings', '/api/dashboard/summary']) {
      const replay = await integration.request(path, { cookie: laptop.cookie });
      expect(replay.status).toBe(401);
    }
    const replayedWrite = await integration.request('/api/goals', {
      method: 'POST',
      cookie: laptop.cookie,
      json: { name: 'Replay' },
    });
    expect(replayedWrite.status).toBe(401);
    expect(
      await read(await integration.request('/api/auth/me', { cookie: laptop.cookie })),
    ).toEqual({ data: null });

    // The phone is a different session and keeps working.
    expect((await integration.request('/api/settings', { cookie: phone.cookie })).status).toBe(200);
  });

  test('signing out twice, or with no session, is harmless', async () => {
    const owner = await integration.signUp('signout-twice');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await integration.request('/api/auth/signout', {
        method: 'POST',
        cookie: owner.cookie,
      });
      expect(response.status).toBe(200);
    }
    expect((await integration.request('/api/auth/signout', { method: 'POST' })).status).toBe(200);
  });
});

describe('session expiry', () => {
  test('an expired session is refused everywhere and cannot be revived', async () => {
    const owner = await integration.signUp('expiry');
    const digest = hashSessionToken(tokenOf(owner.cookie));
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, digest));

    for (const path of ['/api/savings/accounts', '/api/settings', '/api/partner']) {
      const response = await integration.request(path, { cookie: owner.cookie });
      expect(response.status).toBe(401);
      expect(await read(response)).toEqual({ error: 'Session expired' });
    }
    const me = await integration.request('/api/auth/me', { cookie: owner.cookie });
    expect(await read(me)).toEqual({ data: null });
    // Activity does not push an expired session forward.
    expect((await sessionRow(owner.cookie))!.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  test('a session that has not expired keeps working after a long idle time', async () => {
    const owner = await integration.signUp('idle');
    await db
      .update(sessions)
      .set({ lastUsedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) })
      .where(eq(sessions.id, hashSessionToken(tokenOf(owner.cookie))));
    expect((await integration.request('/api/settings', { cookie: owner.cookie })).status).toBe(200);
  });
});

describe('account switching', () => {
  test('signing in as another user while holding a session never mixes the two', async () => {
    const first = await integration.signUp('switch-a');
    const second = await integration.signUp('switch-b');
    await addAccount(first, 's04-switch-a-account', 100, false);
    await addAccount(second, 's04-switch-b-account', 200, false);

    // A browser that still carries the first user's cookies signs in as the second.
    const response = await integration.request('/api/auth/signin', {
      method: 'POST',
      cookie: first.cookie,
      json: { email: second.user.email, password: 'strongpass123' },
    });
    expect(response.status).toBe(200);
    const issued = response.headers.getSetCookie().join('\n');
    const newToken = issued.match(/session=([^;]+)/)![1]!;
    expect(newToken).not.toBe(tokenOf(first.cookie));
    expect(newToken).not.toBe(tokenOf(second.cookie));

    const asSecond = `session=${newToken}; csrf_token=${issued.match(/csrf_token=([^;]+)/)![1]!}`;
    expect(await accountNames({ ...second, cookie: asSecond })).toEqual(['s04-switch-b-account']);
    expect(await accountNames(first)).toEqual(['s04-switch-a-account']);
    expect(
      ((await read(await integration.request('/api/auth/me', { cookie: asSecond }))).data as Json)
        .id,
    ).toBe(second.user.id);
  });
});

describe('ending a partner link', () => {
  test('takes effect on the next request of the other partner open session', async () => {
    const owner = await integration.signUp('unlink-owner');
    const partner = await integration.signUp('unlink-partner');
    await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');

    await addAccount(owner, 's04-unlink-owner-joint', 1000, true);
    await addAccount(owner, 's04-unlink-owner-private', 50, false);
    await addAccount(partner, 's04-unlink-partner-joint', 400, true);
    await addAccount(partner, 's04-unlink-partner-private', 200, false);

    // Linked: each sees the other joint account and not the private one.
    expect(await accountNames(partner)).toEqual([
      's04-unlink-owner-joint',
      's04-unlink-partner-joint',
      's04-unlink-partner-private',
    ]);
    expect(await accountNames(owner)).toEqual([
      's04-unlink-owner-joint',
      's04-unlink-owner-private',
      's04-unlink-partner-joint',
    ]);
    // Joint money counts for half in each person's totals.
    expect(await savingsAllocation(partner)).toBe(500 + 200 + 200);
    expect(await savingsAllocation(owner)).toBe(500 + 50 + 200);

    // The nightly job stores those totals for the current month.
    await runSnapshots();
    expect(await currentSnapshotTotal(partner)).toBe(900);

    const unlink = await integration.request('/api/partner', {
      method: 'DELETE',
      cookie: owner.cookie,
    });
    expect(unlink.status).toBe(200);

    // The partner, who did not act, loses the owner rows on the very next request.
    expect(await accountNames(partner)).toEqual([
      's04-unlink-partner-joint',
      's04-unlink-partner-private',
    ]);
    expect(await accountNames(owner)).toEqual([
      's04-unlink-owner-joint',
      's04-unlink-owner-private',
    ]);
    const [ownerJoint] = await db
      .select()
      .from(savingsAccounts)
      .where(eq(savingsAccounts.userId, owner.user.id));
    const direct = await integration.request(`/api/savings/accounts/${ownerJoint!.id}`, {
      cookie: partner.cookie,
    });
    expect(direct.status).toBe(404);
    expect(
      await read(await integration.request('/api/partner', { cookie: partner.cookie })),
    ).toEqual({
      data: null,
    });

    // Totals follow at once: the stored current-month snapshot does not keep the old share.
    expect(await savingsAllocation(partner)).toBe(400 + 200);
    expect(await savingsAllocation(owner)).toBe(1000 + 50);
    const netWorth = await read(
      await integration.request('/api/dashboard/net-worth', { cookie: partner.cookie }),
    );
    const points = netWorth.data as Array<{ totalValue: number }>;
    expect(points[points.length - 1]!.totalValue).toBe(600);

    // Joint flags were cleared on both sides, so neither can share through the old link.
    const rows = await db.select().from(savingsAccounts);
    for (const row of rows.filter((r) => [owner.user.id, partner.user.id].includes(r.userId))) {
      expect(row.isJoint).toBe(false);
    }
    const stillJoint = await integration.request(`/api/savings/accounts/${ownerJoint!.id}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json: { isJoint: true },
    });
    expect(stillJoint.status).toBe(400);
    expect(await read(stillJoint)).toEqual({ error: 'No partner linked' });

    // The next nightly run stores the new totals for both.
    await runSnapshots();
    expect(await currentSnapshotTotal(partner)).toBe(600);
    expect(await currentSnapshotTotal(owner)).toBe(1050);
  });

  test('a new partner never inherits what the old link shared', async () => {
    const owner = await integration.signUp('relink-owner');
    const first = await integration.signUp('relink-first');
    const second = await integration.signUp('relink-second');
    await insertPartnerLink(owner.user.id, first.user.id, 'accepted');
    await addAccount(owner, 's04-relink-shared-with-first', 100, true);
    expect(await accountNames(first)).toEqual(['s04-relink-shared-with-first']);

    expect(
      (await integration.request('/api/partner', { method: 'DELETE', cookie: owner.cookie }))
        .status,
    ).toBe(200);
    await insertPartnerLink(owner.user.id, second.user.id, 'accepted');

    expect(await accountNames(second)).toEqual([]);
    expect(await accountNames(first)).toEqual([]);
  });
});

describe('invitations', () => {
  test('a pending invitation grants nothing, and only the invited user can accept it', async () => {
    const requester = await integration.signUp('invite-requester');
    const invitee = await integration.signUp('invite-invitee');
    const bystander = await integration.signUp('invite-bystander');
    await addAccount(requester, 's04-invite-requester-account', 10, false);
    await db
      .update(savingsAccounts)
      .set({ isJoint: true })
      .where(eq(savingsAccounts.userId, requester.user.id));

    const invite = await integration.request('/api/partner/invite', {
      method: 'POST',
      cookie: requester.cookie,
      json: { email: invitee.user.email },
    });
    expect(invite.status).toBe(201);

    // Joint-flagged rows stay invisible until the link is accepted.
    expect(await accountNames(invitee)).toEqual([]);

    for (const [who, label] of [
      [requester, 'the requester'],
      [bystander, 'a bystander'],
    ] as const) {
      const accept = await integration.request('/api/partner/accept', {
        method: 'POST',
        cookie: who.cookie,
      });
      expect([label, accept.status]).toEqual([label, 404]);
    }
    expect(await accountNames(invitee)).toEqual([]);
    const [link] = await db
      .select()
      .from(partnerLinks)
      .where(eq(partnerLinks.requesterId, requester.user.id));
    expect(link!.status).toBe('pending');

    // Declining removes the link for both people and leaves no access behind.
    expect(
      (
        await integration.request('/api/partner/decline', {
          method: 'POST',
          cookie: invitee.cookie,
        })
      ).status,
    ).toBe(200);
    expect(
      await read(await integration.request('/api/partner', { cookie: requester.cookie })),
    ).toEqual({
      data: null,
    });
    expect(await accountNames(invitee)).toEqual([]);
  });

  test('accepting makes joint rows visible; no one else can end the link', async () => {
    const requester = await integration.signUp('accept-requester');
    const invitee = await integration.signUp('accept-invitee');
    const bystander = await integration.signUp('accept-bystander');
    await addAccount(requester, 's04-accept-joint', 10, true);
    await insertPartnerLink(requester.user.id, invitee.user.id, 'pending');

    expect(
      (await integration.request('/api/partner/accept', { method: 'POST', cookie: invitee.cookie }))
        .status,
    ).toBe(200);
    expect(await accountNames(invitee)).toEqual(['s04-accept-joint']);

    const intruder = await integration.request('/api/partner', {
      method: 'DELETE',
      cookie: bystander.cookie,
    });
    expect(intruder.status).toBe(404);
    expect(await accountNames(invitee)).toEqual(['s04-accept-joint']);
  });
});

describe('background jobs', () => {
  test('a queued statement import is processed for its owner and stays invisible to everyone else', async () => {
    const owner = await integration.signUp('job-owner');
    const partner = await integration.signUp('job-partner');
    const stranger = await integration.signUp('job-stranger');
    await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');

    const [pot] = await db
      .insert(pensionPots)
      .values({
        userId: owner.user.id,
        name: 's04-job-owner-pot',
        provider: 'Synthetic provider',
        type: 'Personal Pension',
        balance: 0,
        currency: 'EUR',
        employeeMonthly: 0,
        employerMonthly: 0,
      })
      .returning();
    providers.storedDocuments.set(
      's04/job/queued.pdf',
      new TextEncoder().encode('%PDF-1.4\n%fixture\n'),
    );
    const [queued] = await db
      .insert(pensionStatementImports)
      .values({
        userId: owner.user.id,
        potId: pot!.id,
        status: 'queued',
        storageKey: 's04/job/queued.pdf',
        fileName: 'queued.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20,
        fileHashSha256: 's04-job-hash',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning();

    // Nobody else can see the import while it waits.
    for (const other of [partner, stranger]) {
      const waiting = await integration.request(`/api/pensions/imports/${queued!.id}`, {
        cookie: other.cookie,
      });
      expect(waiting.status).toBe(404);
    }

    await runPensionImportWorkerTick();

    const [processed] = await db
      .select()
      .from(pensionStatementImports)
      .where(eq(pensionStatementImports.id, queued!.id));
    expect(processed!.status).toBe('ready_for_review');
    expect(processed!.userId).toBe(owner.user.id);

    const mine = await integration.request(`/api/pensions/imports/${queued!.id}/rows`, {
      cookie: owner.cookie,
    });
    expect(mine.status).toBe(200);
    expect(((await read(mine)).data as unknown[]).length).toBe(1);

    for (const other of [partner, stranger]) {
      for (const path of [
        `/api/pensions/imports/${queued!.id}`,
        `/api/pensions/imports/${queued!.id}/rows`,
      ]) {
        expect((await integration.request(path, { cookie: other.cookie })).status).toBe(404);
      }
      const feed = await integration.request(
        '/api/pensions/imports?statuses=queued,processing,ready_for_review,failed',
        { cookie: other.cookie },
      );
      expect(await read(feed)).toEqual({ data: [] });
    }
  });
});
