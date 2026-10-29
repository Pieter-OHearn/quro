import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { DashboardAllocationsSummary, Mortgage, Property, RunwayResponse } from '@quro/shared';
import { db } from '../db/client';
import {
  budgetCategories,
  budgetTransactions,
  mortgages,
  netWorthSnapshots,
  savingsAccounts,
  savingsTransactions,
  users,
} from '../db/schema';
import { upsertCurrentNetWorthSnapshot } from '../lib/netWorth';
import { createIntegrationHelpers, insertPartnerLink, type AuthSession } from '../test/integration';
import { useFixtureCurrencyRates } from '../test/currencyRates';

const integration = createIntegrationHelpers('household-model.integration.quro.test');
test('archived-account cashflow retains the parent currency and household share', async () => {
  const { owner, partner } = await household();
  const [account] = await db
    .insert(savingsAccounts)
    .values({
      userId: partner.user.id,
      name: 'Closed joint USD',
      bank: 'Bank',
      balance: 0,
      currency: 'USD',
      interestRate: 0,
      accountType: 'Savings',
      isJoint: true,
      archivedAt: new Date(),
    })
    .returning();
  await db.insert(savingsTransactions).values({
    userId: partner.user.id,
    accountId: account!.id,
    type: 'withdrawal',
    amount: 4000,
    date: new Date().toISOString().slice(0, 10),
  });
  const runway = await read<RunwayResponse>(
    await integration.request('/api/plan/runway', { cookie: owner.cookie }),
  );
  expect(runway.burn.lean).toBe(1840);
  expect(runway.tiers[0]?.amount).toBe(0);
});

beforeAll(async () => {
  await integration.cleanup();
  await useFixtureCurrencyRates('household-regression');
});
afterAll(() => integration.cleanup());

async function read<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  return ((await response.json()) as { data: T }).data;
}

async function summary(session: AuthSession) {
  return read<DashboardAllocationsSummary>(
    await integration.request('/api/dashboard/allocations', { cookie: session.cookie }),
  );
}

async function household() {
  const owner = await integration.signUp('owner');
  const partner = await integration.signUp('partner');
  await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
  const property = await read<Property>(
    await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        address: 'Shared home',
        propertyType: 'primary_home',
        purchasePrice: 280000,
        currentValue: 300000,
        monthlyRent: 0,
        currency: 'EUR',
        isJoint: true,
      },
    }),
    201,
  );
  const mortgage = await read<{ id: number }>(
    await integration.request('/api/mortgages', {
      method: 'POST',
      cookie: partner.cookie,
      json: {
        linkedPropertyId: property.id,
        lender: 'Test bank',
        originalAmount: 250000,
        outstandingBalance: 200000,
        monthlyPayment: 1200,
        interestRate: 3,
        rateType: 'fixed',
        fixedUntil: '2031-01-01',
        termYears: 30,
        startDate: '2021-01-01',
        endDate: '2051-01-01',
      },
    }),
    201,
  );
  return { owner, partner, property, mortgage };
}

async function assertTotals(session: AuthSession, expected: number) {
  const allocation = await summary(session);
  expect(allocation).toMatchObject({
    netWorth: expected,
    totalAssets: expected,
    portfolioTotal: 0,
    liabilitiesTotal: 0,
    currency: 'EUR',
    liabilitiesCurrency: 'EUR',
  });
  expect(allocation.allocations.map((row) => row.key)).toEqual([
    'savings',
    'brokerage',
    'property_equity',
    'pension',
  ]);
  expect(allocation.allocations.every((row) => !('color' in row))).toBe(true);
  await upsertCurrentNetWorthSnapshot(session.user.id);
  const [snapshot] = await db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, session.user.id));
  expect(snapshot?.totalValue).toBe(expected);
  const history = await read<Array<{ totalValue: number }>>(
    await integration.request('/api/dashboard/net-worth', { cookie: session.cookie }),
  );
  expect(history.at(-1)?.totalValue).toBe(expected);
}

test('allocations, snapshots, history and property reads share linked debt without hand syncing', async () => {
  const { owner, partner, property, mortgage } = await household();
  await db.insert(savingsAccounts).values([
    {
      userId: owner.user.id,
      name: 'Joint USD',
      bank: 'Bank',
      balance: 10000,
      currency: 'USD',
      interestRate: 0,
      accountType: 'Savings',
      isJoint: true,
    },
    {
      userId: owner.user.id,
      name: 'Private',
      bank: 'Bank',
      balance: 5000,
      currency: 'EUR',
      interestRate: 0,
      accountType: 'Savings',
    },
    {
      userId: partner.user.id,
      name: 'Archived',
      bank: 'Bank',
      balance: 999999,
      currency: 'EUR',
      interestRate: 0,
      accountType: 'Savings',
      isJoint: true,
      archivedAt: new Date(),
    },
  ]);
  await assertTotals(owner, 59600);
  await assertTotals(partner, 54600);
  const repayment = await read<{ id: number }>(
    await integration.request('/api/mortgages/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        mortgageId: mortgage.id,
        type: 'repayment',
        amount: 1200,
        principal: 1000,
        interest: 200,
        date: new Date().toISOString().slice(0, 10),
      },
    }),
    201,
  );
  await assertTotals(owner, 60100);
  await assertTotals(partner, 55100);
  // The property reads its debt from the linked mortgage, and its equity weights each side by
  // its own row's share, as the dashboard does.
  const resolved = await read<Property>(
    await integration.request(`/api/investments/properties/${property.id}`, {
      cookie: partner.cookie,
    }),
  );
  expect(resolved).toMatchObject({ debt: 199000, totalEquity: 101000, equity: 50500 });
  await read(
    await integration.request(`/api/mortgages/transactions/${repayment.id}`, {
      method: 'DELETE',
      cookie: partner.cookie,
    }),
  );
  await assertTotals(owner, 59600);
  // A repayment belongs to the mortgage and a valuation to the property: each ledger refuses
  // the other's rows.
  const today = new Date().toISOString().slice(0, 10);
  const refusedRepayment = await integration.request('/api/investments/property-transactions', {
    method: 'POST',
    cookie: partner.cookie,
    json: { propertyId: property.id, type: 'repayment', amount: 1200, date: today },
  });
  expect(refusedRepayment.status).toBe(400);
  const refusedValuation = await integration.request('/api/mortgages/transactions', {
    method: 'POST',
    cookie: partner.cookie,
    json: { mortgageId: mortgage.id, type: 'valuation', amount: 320000, date: today },
  });
  expect(refusedValuation.status).toBe(400);
  // A property valuation moves the value every reader uses: (320,000 - 200,000) × 0.5.
  const valuation = await read<{ id: number }>(
    await integration.request('/api/investments/property-transactions', {
      method: 'POST',
      cookie: partner.cookie,
      json: { propertyId: property.id, type: 'valuation', amount: 320000, date: today },
    }),
    201,
  );
  await assertTotals(partner, 64600);
  const mortgageRead = await read<Mortgage>(
    await integration.request(`/api/mortgages/${mortgage.id}`, { cookie: owner.cookie }),
  );
  expect(mortgageRead).toMatchObject({
    linkedPropertyId: property.id,
    propertyAddress: 'Shared home',
    propertyValue: 320000,
  });
  await read(
    await integration.request(`/api/investments/property-transactions/${valuation.id}`, {
      method: 'DELETE',
      cookie: owner.cookie,
    }),
  );
  // The last valuation is gone: the property keeps the value it had.
  await assertTotals(partner, 64600);
});

test('archiving, restoring and unlinking a mortgage never resurrects its property copy', async () => {
  const { owner, partner, property, mortgage } = await household();
  const archivedProperty = await read<Property>(
    await integration.request(`/api/investments/properties/${property.id}`, {
      method: 'DELETE',
      cookie: owner.cookie,
    }),
  );
  expect(archivedProperty.debt).toBe(200000);
  await assertTotals(partner, 0);
  const restoredProperty = await read<Property>(
    await integration.request(`/api/investments/properties/${property.id}/unarchive`, {
      method: 'POST',
      cookie: owner.cookie,
    }),
  );
  expect(restoredProperty.debt).toBe(200000);
  await assertTotals(partner, 50000);
  await read(
    await integration.request(`/api/mortgages/${mortgage.id}`, {
      method: 'DELETE',
      cookie: owner.cookie,
    }),
  );
  await assertTotals(partner, 150000);
  const archived = await read<Property>(
    await integration.request(`/api/investments/properties/${property.id}`, {
      cookie: owner.cookie,
    }),
  );
  expect(archived.debt).toBe(0);
  await read(
    await integration.request(`/api/mortgages/${mortgage.id}/unarchive`, {
      method: 'POST',
      cookie: owner.cookie,
    }),
  );
  await assertTotals(partner, 50000);
  await read(
    await integration.request(`/api/investments/properties/${property.id}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json: { mortgageId: null },
    }),
  );
  await assertTotals(owner, 150000);
  // An unlinked property has no debt, and a debt kept on the property is no longer accepted.
  const manualDebt = await integration.request(`/api/investments/properties/${property.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    json: { mortgage: 40000 },
  });
  expect(manualDebt.status).toBe(400);
  await assertTotals(partner, 150000);
  const [loan] = await db.select().from(mortgages).where(eq(mortgages.id, mortgage.id));
  expect(loan?.outstandingBalance).toBe(200000);
});

test("after the partner link is removed, neither side reads the other's linked row", async () => {
  // The owner's property is linked to the partner's mortgage; removing the link makes both private.
  const { owner, partner, property, mortgage } = await household();
  const removed = await integration.request('/api/partner', {
    method: 'DELETE',
    cookie: owner.cookie,
  });
  expect(removed.status).toBe(200);

  const ownProperty = await read<Property>(
    await integration.request(`/api/investments/properties/${property.id}`, {
      cookie: owner.cookie,
    }),
  );
  // The partner's now private balance is not shown: the property carries no debt, as in net worth.
  expect(ownProperty).toMatchObject({ debt: 0, totalEquity: 300000, equity: 300000 });
  await assertTotals(owner, 300000);

  const ownMortgage = await read<Mortgage>(
    await integration.request(`/api/mortgages/${mortgage.id}`, { cookie: partner.cookie }),
  );
  // And the owner's now private property does not show through the partner's mortgage.
  expect(ownMortgage).toMatchObject({
    linkedPropertyId: null,
    propertyAddress: null,
    propertyValue: null,
  });
});

test('runway uses EUR for foreign budgets and keeps joint liquidity overrides separate from contractual debt', async () => {
  const { owner, property } = await household();
  await db
    .update(users)
    .set({ baseCurrency: 'GBP', jurisdiction: 'GENERIC' })
    .where(eq(users.id, owner.user.id));
  await db.insert(savingsAccounts).values({
    userId: owner.user.id,
    name: 'Joint GBP',
    bank: 'Bank',
    balance: 20000,
    currency: 'GBP',
    interestRate: 0,
    accountType: 'Savings',
    isJoint: true,
  });
  for (const offset of [0, -1]) {
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const [category] = await db
      .insert(budgetCategories)
      .values({
        userId: owner.user.id,
        name: 'Food',
        budgeted: 1180,
        spent: 1180,
        month: date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
        year: date.getUTCFullYear(),
      })
      .returning();
    await db.insert(budgetTransactions).values({
      userId: owner.user.id,
      categoryId: category!.id,
      amount: 1180,
      description: 'Food',
      merchant: 'Food shop',
      date: date.toISOString().slice(0, 10),
    });
  }
  const getRunway = async () =>
    read<RunwayResponse>(await integration.request('/api/plan/runway', { cookie: owner.cookie }));
  const half = await getRunway();
  expect(half.baseCurrency).toBe('EUR');
  expect(half.burn.lean).toBe(1780); // £1,000 × 1.18 + €1,200 / 2
  expect(half.tiers[0]?.amount).toBe(11800);
  expect(half.runway.monthsCashOnly).toBeCloseTo(11800 / 1780, 10);
  expect(half.jurisdiction).toMatchObject({
    unemploymentModel: 'none',
    labels: { unemploymentShort: 'Unemployment support' },
  });
  await read(
    await integration.request('/api/plan/assumptions', {
      method: 'PUT',
      cookie: owner.cookie,
      json: { countFullJointBalances: true, leanBurnOverride: 1000 },
    }),
  );
  const full = await getRunway();
  expect(full.burn.lean).toBe(1180);
  expect(full.burn.components.find((row) => row.source === 'mortgage')?.amount).toBe(600);
  expect(full.tiers[0]?.amount).toBe(23600);
  expect(full.runway.monthsCashOnly).toBe(20);
  expect((await summary(owner)).netWorth).toBe(61800);
  const outsider = await integration.signUp('outsider');
  expect(
    (
      await integration.request(`/api/investments/properties/${property.id}`, {
        cookie: outsider.cookie,
      })
    ).status,
  ).toBe(404);
});
