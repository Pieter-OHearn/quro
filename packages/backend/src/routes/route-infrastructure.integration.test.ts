import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  netWorthSnapshots,
  partnerLinks,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { findAccessible, findAccessibleChild, findOwnedRow, listChildRows } from '../lib/access';
import { getPartnerId } from '../lib/authUser';
import { withLedgerWrite } from '../lib/ledgerWrite';
import { PUBLIC_PATHS } from '../lib/publicPaths';
import { requireAuth } from '../middleware/auth';
import { requireCsrf } from '../middleware/csrf';
import { createIntegrationHelpers, type AuthSession } from '../test/integration';

const integration = createIntegrationHelpers('wp5.integration.quro.test');
const SNAPSHOT_DATES = ['2026-02-28', '2026-03-31', '2026-04-30'];
const CHILD_RESOURCE = {
  table: savingsTransactions,
  parent: savingsAccounts,
  parentId: savingsTransactions.accountId,
};

beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());

async function createHousehold() {
  const owner = await integration.signUp('owner');
  const partner = await integration.signUp('partner');
  const outsider = await integration.signUp('outsider');
  await db.insert(partnerLinks).values({
    requesterId: owner.user.id,
    addresseeId: partner.user.id,
    status: 'accepted',
  });
  return { owner, partner, outsider };
}

async function createAccount(owner: AuthSession, isJoint: boolean) {
  const [account] = await db
    .insert(savingsAccounts)
    .values({
      userId: owner.user.id,
      name: 'Test account',
      bank: 'Test bank',
      balance: 0,
      currency: 'EUR',
      interestRate: 0,
      accountType: 'Savings',
      isJoint,
    })
    .returning();
  return account;
}

async function seedSnapshots(userIds: readonly number[]) {
  await db.delete(netWorthSnapshots).where(inArray(netWorthSnapshots.userId, [...userIds]));
  await db.insert(netWorthSnapshots).values(
    userIds.flatMap((userId) =>
      SNAPSHOT_DATES.map((snapshotDate) => ({
        userId,
        snapshotDate,
        baseCurrency: 'EUR' as const,
        savings: 0,
        brokerage: 0,
        propertyEquity: 0,
        pension: 0,
        liabilities: 0,
        totalValue: 0,
      })),
    ),
  );
}

async function snapshotDates(userId: number) {
  const rows = await db
    .select({ date: netWorthSnapshots.snapshotDate })
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, userId))
    .orderBy(netWorthSnapshots.snapshotDate);
  return rows.map((row) => row.date);
}

async function createTransaction(accountId: number, session: AuthSession) {
  const response = await integration.request('/api/savings/transactions', {
    method: 'POST',
    cookie: session.cookie,
    json: { accountId, type: 'deposit', amount: 100, date: '2026-04-10' },
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { id: number } }).data;
}

describe('default-deny API middleware', () => {
  test('protects newly registered routes and public-path lookalikes', async () => {
    const app = new Hono();
    app.use('/api/*', requireAuth);
    app.get('/api/new-resource', (c) => c.json({ partnerId: getPartnerId(c) }));
    for (const path of [
      '/api/new-resource',
      '/api/auth/admin',
      '/api/health/private',
      '/api/bunq/oauth/callback/extra',
    ]) {
      expect((await app.request(path)).status).toBe(401);
    }
    const { owner, partner } = await createHousehold();
    for (const [session, expectedPartner] of [
      [owner, partner.user.id],
      [partner, owner.user.id],
    ] as const) {
      const response = await app.request('/api/new-resource', {
        headers: { Cookie: session.cookie },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ partnerId: expectedPartner });
    }
  });

  test('preserves public session discovery and shares exact CSRF exemptions', async () => {
    expect(await (await integration.request('/api/auth/me')).json()).toEqual({ data: null });
    expect((await integration.request('/api/health')).status).toBe(200);
    const app = new Hono();
    app.use('*', requireCsrf);
    app.post('*', (c) => c.json({ ok: true }));
    for (const path of PUBLIC_PATHS) {
      expect((await app.request(path, { method: 'POST' })).status).toBe(200);
      expect((await app.request(`${path}/extra`, { method: 'POST' })).status).toBe(403);
    }
  });

  test('resolves only accepted links and refreshes the context after unlinking', async () => {
    const { owner, partner } = await createHousehold();
    const app = new Hono();
    app.use('/api/*', requireAuth);
    app.get('/api/context', (c) => c.json({ partnerId: getPartnerId(c) }));
    const readPartner = async () =>
      (
        await app.request('/api/context', {
          headers: { Cookie: owner.cookie },
        })
      ).json();
    await db
      .update(partnerLinks)
      .set({ status: 'pending' })
      .where(eq(partnerLinks.requesterId, owner.user.id));
    expect(await readPartner()).toEqual({ partnerId: null });
    await db
      .update(partnerLinks)
      .set({ status: 'accepted' })
      .where(eq(partnerLinks.requesterId, owner.user.id));
    expect(await readPartner()).toEqual({ partnerId: partner.user.id });
    await db.delete(partnerLinks).where(eq(partnerLinks.requesterId, owner.user.id));
    expect(await readPartner()).toEqual({ partnerId: null });
  });
});

describe('shared access and lifecycle handlers', () => {
  test('scopes parents and child ledgers to ownership or an accepted joint partner', async () => {
    const { owner, partner, outsider } = await createHousehold();
    const joint = await createAccount(owner, true);
    const personal = await createAccount(owner, false);
    const transaction = await createTransaction(joint.id, owner);
    const scope = { userId: partner.user.id, partnerId: owner.user.id };
    expect(await findOwnedRow(savingsAccounts, joint.id, partner.user.id)).toBeNull();
    expect((await findAccessible(savingsAccounts, joint.id, scope))?.id).toBe(joint.id);
    expect(await findAccessible(savingsAccounts, personal.id, scope)).toBeNull();
    expect((await findAccessibleChild(CHILD_RESOURCE, transaction.id, scope))?.id).toBe(
      transaction.id,
    );
    expect(
      await listChildRows(CHILD_RESOURCE, { userId: outsider.user.id, partnerId: null }),
    ).toEqual([]);
    expect(await listChildRows(CHILD_RESOURCE, scope, { parentId: personal.id })).toEqual([]);
  });

  test('archives joint accounts, retains their ledger, restores, and cascades with access checks', async () => {
    const { owner, partner, outsider } = await createHousehold();
    const account = await createAccount(owner, true);
    await createTransaction(account.id, owner);
    const path = `/api/savings/accounts/${account.id}`;
    const remove = (session: AuthSession, suffix = '') =>
      integration.request(path + suffix, {
        method: 'DELETE',
        cookie: session.cookie,
      });
    expect((await remove(outsider)).status).toBe(404);
    expect((await remove(partner)).status).toBe(200);
    expect((await remove(owner)).status).toBe(404);
    const history = await integration.request(`/api/savings/transactions?accountId=${account.id}`, {
      cookie: partner.cookie,
    });
    expect(((await history.json()) as { data: unknown[] }).data).toHaveLength(1);
    expect(
      (await integration.request(path + '/unarchive', { method: 'POST', cookie: outsider.cookie }))
        .status,
    ).toBe(404);
    expect(
      (await integration.request(path + '/unarchive', { method: 'POST', cookie: partner.cookie }))
        .status,
    ).toBe(200);
    expect((await remove(outsider, '?cascade=true')).status).toBe(404);
    expect((await remove(partner, '?cascade=true')).status).toBe(200);
    expect(
      await db
        .select()
        .from(savingsTransactions)
        .where(eq(savingsTransactions.accountId, account.id)),
    ).toEqual([]);
  });
});

describe('household snapshot invalidation', () => {
  test('create, moved update with an earlier date, and delete invalidate both affected owners', async () => {
    const { owner, partner, outsider } = await createHousehold();
    const joint = await createAccount(owner, true);
    const partnerPersonal = await createAccount(partner, false);
    const ids = [owner.user.id, partner.user.id, outsider.user.id];
    await seedSnapshots(ids);
    const transaction = await createTransaction(joint.id, partner);
    for (const id of ids.slice(0, 2))
      expect(await snapshotDates(id)).toEqual(SNAPSHOT_DATES.slice(0, 2));
    expect(await snapshotDates(outsider.user.id)).toEqual(SNAPSHOT_DATES);
    await seedSnapshots(ids);
    const path = `/api/savings/transactions/${transaction.id}`;
    const edited = await integration.request(path, {
      method: 'PATCH',
      cookie: partner.cookie,
      json: { accountId: partnerPersonal.id, date: '2026-03-10' },
    });
    expect(edited.status).toBe(200);
    for (const id of ids.slice(0, 2))
      expect(await snapshotDates(id)).toEqual(SNAPSHOT_DATES.slice(0, 1));
    expect(await snapshotDates(outsider.user.id)).toEqual(SNAPSHOT_DATES);
    await seedSnapshots(ids);
    expect(
      (await integration.request(path, { method: 'DELETE', cookie: partner.cookie })).status,
    ).toBe(200);
    expect(await snapshotDates(partner.user.id)).toEqual(SNAPSHOT_DATES.slice(0, 1));
    expect(await snapshotDates(owner.user.id)).toEqual(SNAPSHOT_DATES);
  });

  test('joint mortgage and property ledger mutations invalidate both household dashboards', async () => {
    const { owner, partner, outsider } = await createHousehold();
    const propertyResponse = await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        address: 'Snapshot test property',
        propertyType: 'investment',
        purchasePrice: 280000,
        currentValue: 300000,
        monthlyRent: 0,
        currency: 'EUR',
        isJoint: true,
      },
    });
    expect(propertyResponse.status).toBe(201);
    const property = ((await propertyResponse.json()) as { data: { id: number } }).data;
    const mortgageResponse = await integration.request('/api/mortgages', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        linkedPropertyId: property.id,
        lender: 'Test lender',
        originalAmount: 250000,
        propertyAddress: 'Snapshot test property',
        currency: 'EUR',
        propertyValue: 300000,
        outstandingBalance: 200000,
        monthlyPayment: 1200,
        interestRate: 3,
        rateType: 'fixed',
        fixedUntil: '2031-01-01',
        termYears: 30,
        startDate: '2021-01-01',
        endDate: '2051-01-01',
        overpaymentLimit: 10,
        isJoint: true,
      },
    });
    expect(mortgageResponse.status).toBe(201);
    const mortgage = ((await mortgageResponse.json()) as { data: { id: number } }).data;
    const ids = [owner.user.id, partner.user.id, outsider.user.id];
    for (const [path, parent] of [
      ['/api/mortgages/transactions', { mortgageId: mortgage.id }],
      ['/api/investments/property-transactions', { propertyId: property.id }],
    ] as const) {
      await seedSnapshots(ids);
      const created = await integration.request(path, {
        method: 'POST',
        cookie: partner.cookie,
        json: {
          ...parent,
          type: 'repayment',
          amount: 100,
          principal: 100,
          interest: 0,
          date: '2026-04-10',
        },
      });
      expect(created.status).toBe(201);
      const transaction = ((await created.json()) as { data: { id: number } }).data;
      for (const id of ids.slice(0, 2))
        expect(await snapshotDates(id)).toEqual(SNAPSHOT_DATES.slice(0, 2));
      await seedSnapshots(ids);
      const edited = await integration.request(`${path}/${transaction.id}`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { date: '2026-03-10' },
      });
      expect(edited.status).toBe(200);
      for (const id of ids.slice(0, 2))
        expect(await snapshotDates(id)).toEqual(SNAPSHOT_DATES.slice(0, 1));
      await seedSnapshots(ids);
      expect(
        (
          await integration.request(`${path}/${transaction.id}`, {
            method: 'DELETE',
            cookie: partner.cookie,
          })
        ).status,
      ).toBe(200);
      for (const id of ids.slice(0, 2))
        expect(await snapshotDates(id)).toEqual(SNAPSHOT_DATES.slice(0, 1));
      expect(await snapshotDates(outsider.user.id)).toEqual(SNAPSHOT_DATES);
    }
  });

  test('private writes invalidate only the owner and invalidation rolls back with the ledger', async () => {
    const { owner, partner } = await createHousehold();
    const account = await createAccount(owner, false);
    const ids = [owner.user.id, partner.user.id];
    await seedSnapshots(ids);
    await createTransaction(account.id, owner);
    expect(await snapshotDates(owner.user.id)).toEqual(SNAPSHOT_DATES.slice(0, 2));
    expect(await snapshotDates(partner.user.id)).toEqual(SNAPSHOT_DATES);
    await seedSnapshots(ids);
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(savingsAccounts)
          .set({ balance: 999 })
          .where(eq(savingsAccounts.id, account.id));
        await withLedgerWrite(tx, { userId: owner.user.id }, '2026-03-10');
        throw new Error('Rollback ledger write');
      });
    } catch (error) {
      expect((error as Error).message).toBe('Rollback ledger write');
    }
    expect((await findOwnedRow(savingsAccounts, account.id, owner.user.id))?.balance).toBe(100);
    for (const id of ids) expect(await snapshotDates(id)).toEqual(SNAPSHOT_DATES);
    const badWrite = await integration.request('/api/savings/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: { accountId: account.id, amount: -1, type: 'deposit', date: '2026-03-10' },
    });
    expect(badWrite.status).toBe(400);
    for (const id of ids) expect(await snapshotDates(id)).toEqual(SNAPSHOT_DATES);
  });
});
