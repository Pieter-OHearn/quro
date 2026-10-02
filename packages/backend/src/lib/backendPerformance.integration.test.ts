import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { CURRENCY_CODES, addMonthsUtc, monthEndUtc, monthStartUtc, toIsoDate } from '@quro/shared';
import { db } from '../db/client';
import {
  savingsAccounts,
  savingsTransactions,
  holdings,
  holdingTransactions,
  holdingPriceHistory,
  properties,
  propertyTransactions,
  pensionPots,
  pensionTransactions,
  mortgages,
  debts,
  debtPayments,
  netWorthSnapshots,
  workerHeartbeats,
  currencyRates,
} from '../db/schema';
import { createIntegrationHelpers } from '../test/integration';
import {
  buildNetWorthHistory,
  buildAllocationsFromSource,
  loadNetWorthSourceData,
} from './netWorthHistory';
import { getCurrentRatesToBaseCurrency, getHistoricalCurrencyRateRows } from './currencyRateSync';
import { runScheduledJob } from './scheduledJob';

const integration = createIntegrationHelpers('backend-performance.quro.test');
beforeAll(async () => {
  await integration.cleanup();
  const rates = { GBP: 1.18, USD: 0.92, AUD: 0.58, NZD: 0.53, CAD: 0.67, CHF: 1.04, SGD: 0.68 };
  await db
    .insert(currencyRates)
    .values(
      CURRENCY_CODES.filter((currency) => currency !== 'EUR').map((fromCurrency) => ({
        fromCurrency,
        toCurrency: 'EUR' as const,
        rate: rates[fromCurrency as keyof typeof rates],
        provider: 'test',
        sourceDate: '2020-01-01',
        updatedAt: new Date(),
      })),
    )
    .onConflictDoNothing();
});
afterAll(() => integration.cleanup());

async function loadFullSource(userId: number) {
  const [
    rates,
    historicalRates,
    savings,
    savingsTxns,
    holdingRows,
    holdingTxns,
    prices,
    propertyRows,
    propertyTxns,
    pensions,
    pensionTxns,
    mortgageRows,
    debtRows,
    payments,
    snapshots,
  ] = await Promise.all([
    getCurrentRatesToBaseCurrency(),
    getHistoricalCurrencyRateRows(),
    db.select().from(savingsAccounts).where(eq(savingsAccounts.userId, userId)),
    db.select().from(savingsTransactions).where(eq(savingsTransactions.userId, userId)),
    db.select().from(holdings).where(eq(holdings.userId, userId)),
    db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
    db.select().from(holdingPriceHistory).where(eq(holdingPriceHistory.userId, userId)),
    db.select().from(properties).where(eq(properties.userId, userId)),
    db.select().from(propertyTransactions).where(eq(propertyTransactions.userId, userId)),
    db.select().from(pensionPots).where(eq(pensionPots.userId, userId)),
    db.select().from(pensionTransactions).where(eq(pensionTransactions.userId, userId)),
    db.select().from(mortgages).where(eq(mortgages.userId, userId)),
    db.select().from(debts).where(eq(debts.userId, userId)),
    db.select().from(debtPayments).where(eq(debtPayments.userId, userId)),
    db.select().from(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId)),
  ]);
  return {
    rates,
    historicalRates,
    savings,
    savingsTransactions: savingsTxns,
    holdings: holdingRows,
    holdingTransactions: holdingTxns,
    holdingPrices: prices,
    properties: propertyRows,
    propertyTransactions: propertyTxns,
    pensions,
    pensionTransactions: pensionTxns,
    mortgages: mortgageRows,
    debts: debtRows,
    debtPayments: payments,
    snapshots,
  };
}

async function seedLedger(userId: number) {
  const now = Date.now();
  const old = '2020-01-01';
  const recent = toIsoDate(new Date(monthStartUtc(now)));
  const future = toIsoDate(new Date(addMonthsUtc(monthStartUtc(now), 1)));
  const [account] = await db
    .insert(savingsAccounts)
    .values({
      userId,
      name: 'Savings',
      bank: 'Test',
      accountType: 'Easy Access',
      balance: 1500,
      currency: 'EUR',
      interestRate: 0,
    })
    .returning();
  await db.insert(savingsTransactions).values(
    Array.from({ length: 100 }, () => ({
      userId,
      accountId: account.id,
      type: 'deposit',
      amount: 10,
      date: old,
    })),
  );
  await db.insert(savingsTransactions).values([
    { userId, accountId: account.id, type: 'withdrawal', amount: 50, date: recent },
    { userId, accountId: account.id, type: 'deposit', amount: 30, date: future },
  ]);
  const [holding] = await db
    .insert(holdings)
    .values({
      userId,
      name: 'Stock',
      ticker: 'TEST',
      sector: 'Test',
      currentPrice: 30,
      currency: 'EUR',
    })
    .returning();
  await db.insert(holdingTransactions).values(
    Array.from({ length: 100 }, () => ({
      userId,
      holdingId: holding.id,
      type: 'buy',
      shares: 1,
      price: 10,
      date: old,
    })),
  );
  await db.insert(holdingTransactions).values([
    { userId, holdingId: holding.id, type: 'sell', shares: 25, price: 15, date: '2021-01-01' },
    { userId, holdingId: holding.id, type: 'sell', shares: 5, price: 25, date: recent },
  ]);
  await db.insert(holdingPriceHistory).values([
    { userId, holdingId: holding.id, eodDate: old, closePrice: 11, priceCurrency: 'EUR' },
    { userId, holdingId: holding.id, eodDate: '2021-01-01', closePrice: 20, priceCurrency: 'EUR' },
    { userId, holdingId: holding.id, eodDate: recent, closePrice: 25, priceCurrency: 'EUR' },
  ]);
  const [property] = await db
    .insert(properties)
    .values({
      userId,
      address: 'Test street',
      propertyType: 'House',
      monthlyRent: 0,
      purchasePrice: 100000,
      currentValue: 150000,
      mortgage: 20000,
      currency: 'EUR',
    })
    .returning();
  await db.insert(propertyTransactions).values([
    { userId, propertyId: property.id, type: 'valuation', amount: 110000, date: old },
    { userId, propertyId: property.id, type: 'valuation', amount: 150000, date: '2021-01-01' },
    {
      userId,
      propertyId: property.id,
      type: 'repayment',
      amount: 100,
      principal: 80,
      interest: 20,
      date: recent,
    },
    {
      userId,
      propertyId: property.id,
      type: 'repayment',
      amount: 100,
      principal: 80,
      interest: 20,
      date: future,
    },
  ]);
  const [pot] = await db
    .insert(pensionPots)
    .values({
      userId,
      provider: 'Test',
      name: 'Test pension',
      type: 'Defined Contribution',
      employeeMonthly: 0,
      employerMonthly: 0,
      balance: 10000,
      currency: 'EUR',
    })
    .returning();
  await db.insert(pensionTransactions).values([
    { userId, potId: pot.id, type: 'contribution', amount: 500, date: old },
    { userId, potId: pot.id, type: 'contribution', amount: 100, date: recent },
    { userId, potId: pot.id, type: 'fee', amount: 20, date: future },
  ]);
  const [debt] = await db
    .insert(debts)
    .values({
      userId,
      name: 'Test loan',
      type: 'personal_loan',
      originalAmount: 1000,
      lender: 'Test',
      startDate: old,
      color: '#000000',
      emoji: 'L',
      remainingBalance: 500,
      interestRate: 0,
      currency: 'EUR',
      monthlyPayment: 50,
    })
    .returning();
  await db.insert(debtPayments).values([
    { userId, debtId: debt.id, amount: 50, principal: 50, interest: 0, date: old },
    { userId, debtId: debt.id, amount: 50, principal: 50, interest: 0, date: recent },
    { userId, debtId: debt.id, amount: 50, principal: 50, interest: 0, date: future },
  ]);
}

test('bounded history matches full ledgers with opening positions and future repayments', async () => {
  const owner = await integration.signUp('bounded-history');
  await seedLedger(owner.user.id);
  const full = await loadFullSource(owner.user.id);
  const bounded = await loadNetWorthSourceData(owner.user.id, null);
  expect(buildNetWorthHistory(bounded)).toEqual(buildNetWorthHistory(full));
  expect(buildAllocationsFromSource(bounded)).toEqual(buildAllocationsFromSource(full));
  expect(bounded.holdingTransactions).toHaveLength(2);
  expect(bounded.savingsTransactions).toHaveLength(3);
  expect(bounded.holdingPrices).toHaveLength(2);
  const response = await integration.request('/api/dashboard/summary', { cookie: owner.cookie });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({
    netWorth: buildNetWorthHistory(full),
    allocations: buildAllocationsFromSource(full),
  });
});

test('retains completed snapshots and expands the window after invalidation', async () => {
  const owner = await integration.signUp('snapshots');
  await seedLedger(owner.user.id);
  const current = monthStartUtc(Date.now());
  await db.insert(netWorthSnapshots).values(
    Array.from({ length: 6 }, (_, index) => ({
      userId: owner.user.id,
      snapshotDate: toIsoDate(new Date(monthEndUtc(addMonthsUtc(current, -(index + 1))))),
      baseCurrency: 'EUR' as const,
      savings: 1000,
      brokerage: 0,
      propertyEquity: 0,
      pension: 0,
      liabilities: 0,
      totalValue: 1000 + index,
      isEstimated: true,
    })),
  );
  const bounded = await loadNetWorthSourceData(owner.user.id, null);
  expect(buildNetWorthHistory(bounded)).toEqual(
    buildNetWorthHistory(await loadFullSource(owner.user.id)),
  );
  await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, owner.user.id));
  const rebuilt = await loadNetWorthSourceData(owner.user.id, null);
  expect(buildNetWorthHistory(rebuilt)).toEqual(
    buildNetWorthHistory(await loadFullSource(owner.user.id)),
  );
});

test('only one replica runs a scheduled job and failures remain retryable', async () => {
  const name = `performance-test-${crypto.randomUUID()}`;
  let calls = 0;
  let started: () => void = () => {};
  let finish: () => void = () => {};
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const first = runScheduledJob(name, 60000, async () => {
    calls++;
    started();
    await gate;
  });
  await start;
  await runScheduledJob(name, 60000, () => {
    calls++;
    return Promise.resolve();
  });
  expect(calls).toBe(1);
  finish();
  await first;
  await runScheduledJob(name, 60000, () => {
    calls++;
    return Promise.resolve();
  });
  expect(calls).toBe(1);
  await db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerName, `scheduler:${name}`));
  await expect(
    runScheduledJob(name, 60000, () => Promise.reject(new Error('test failure'))),
  ).rejects.toThrow('test failure');
  await runScheduledJob(name, 60000, () => {
    calls++;
    return Promise.resolve();
  });
  expect(calls).toBe(2);
  await db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerName, `scheduler:${name}`));
  // No session locks leak back into the pool.
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::integer from pg_locks where locktype = 'advisory'`,
  );
  expect(result[0].count).toBe(0);
});

test('concurrent workers claim distinct imports and skip expired queued rows', async () => {
  const { lockNextQueuedImport } = await import('../routes/pension-imports');
  const { pensionStatementImports } = await import('../db/schema');
  const owner = await integration.signUp('worker-claims');
  const [pot] = await db
    .insert(pensionPots)
    .values({
      userId: owner.user.id,
      provider: 'Test',
      name: 'Test pension',
      type: 'Defined Contribution',
      balance: 0,
      employeeMonthly: 0,
      employerMonthly: 0,
      currency: 'EUR',
    })
    .returning();
  const rows = await db
    .insert(pensionStatementImports)
    .values(
      Array.from({ length: 3 }, (_, index) => ({
        userId: owner.user.id,
        potId: pot.id,
        storageKey: `test-${index}`,
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        fileHashSha256: String(index),
        expiresAt: new Date(Date.now() + (index === 0 ? -60000 : 60000)),
      })),
    )
    .returning();
  const claimed = await Promise.all([lockNextQueuedImport(), lockNextQueuedImport()]);
  expect(new Set(claimed.map((row) => row?.id)).size).toBe(2);
  expect(claimed.every((row) => row?.status === 'processing')).toBe(true);
  expect(claimed.some((row) => row?.id === rows[0].id)).toBe(false);
  expect(await lockNextQueuedImport()).toBeNull();
});
