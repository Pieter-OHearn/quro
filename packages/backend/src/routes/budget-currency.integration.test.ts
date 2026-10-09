import { afterAll, beforeAll, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
  formatBudgetMonthFromDate,
  type BudgetCategory,
  type BudgetTransaction,
  type CurrencyCode,
  type RunwayResponse,
} from '@quro/shared';
import { db } from '../db/client';
import { budgetCategories, budgetTransactions, savingsAccounts } from '../db/schema';
import { type BunqMonetaryAccount, type BunqPayment } from '../lib/bunqClient';
import { importBudgetPayment } from '../services/bunqBudgetSync';
import { createIntegrationHelpers, type AuthSession } from '../test/integration';
import { useFixtureCurrencyRates } from '../test/currencyRates';

const integration = createIntegrationHelpers('budget-currency.integration.quro.test');
const monthDates = [0, -1].map((offset) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
});

beforeAll(async () => {
  await integration.cleanup();
  await useFixtureCurrencyRates('budget-regression');
});
afterAll(() => integration.cleanup());

async function read<T>(result: Response | Promise<Response>, status = 200): Promise<T> {
  const response = await result;
  expect(response.status).toBe(status);
  return ((await response.json()) as { data: T }).data;
}

async function preference(session: AuthSession, currency: CurrencyCode) {
  await read(
    await integration.request('/api/settings/preferences', {
      method: 'PUT',
      cookie: session.cookie,
      json: { baseCurrency: currency },
    }),
  );
}

function runway(session: AuthSession) {
  return read<RunwayResponse>(integration.request('/api/plan/runway', { cookie: session.cookie }));
}

async function fundedUser(label: string) {
  const session = await integration.signUp(label);
  await db.insert(savingsAccounts).values({
    userId: session.user.id,
    name: 'Reserve',
    bank: 'Bank',
    balance: 20000,
    currency: 'EUR',
    interestRate: 0,
    accountType: 'Savings',
  });
  return session;
}

function category(
  session: AuthSession,
  date: Date,
  currency?: CurrencyCode,
  amount = 1000,
  name = 'Food',
) {
  return read<BudgetCategory>(
    integration.request('/api/budget/categories', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        name,
        emoji: 'G',
        budgeted: amount,
        spent: 0,
        color: '#111827',
        month: formatBudgetMonthFromDate(date),
        year: date.getFullYear(),
        ...(currency ? { currency } : {}),
      },
    }),
    201,
  );
}

function spending(
  session: AuthSession,
  categoryId: number,
  date: Date,
  currency?: CurrencyCode,
  amount = 1000,
) {
  return read<BudgetTransaction>(
    integration.request('/api/budget/transactions', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        categoryId,
        amount,
        merchant: 'Food shop',
        description: 'Food',
        date: date.toISOString().slice(0, 10),
        ...(currency ? { currency } : {}),
      },
    }),
    201,
  );
}

function payment(id: number, date: Date, currency = 'EUR'): BunqPayment {
  return {
    id,
    amount: { value: '-1000.00', currency },
    description: 'Food',
    counterpartyAlias: {
      displayName: 'Food shop',
      iban: null,
      merchantCategoryCode: '5411',
      bunqUserId: null,
    },
    created: date.toISOString(),
    type: 'CARD',
    subType: '',
  };
}

function account(currency = 'EUR'): BunqMonetaryAccount {
  return {
    id: 123,
    type: 'BANK',
    description: 'Bunq',
    balance: { value: '20000', currency },
    iban: null,
    status: 'ACTIVE',
  };
}

function importPayment(session: AuthSession, value: BunqPayment) {
  return importBudgetPayment(
    session.user.id,
    value,
    account(value.amount.currency),
    new Set(),
    '12345',
  );
}

test('changing display currency preserves EUR spending, budget amounts and 20-month runway', async () => {
  const session = await fundedUser('preference');
  for (const date of monthDates) {
    const row = await category(session, date, 'EUR');
    await spending(session, row.id, date, 'EUR');
  }
  const before = await runway(session);
  expect(before).toMatchObject({
    baseCurrency: 'EUR',
    burn: { lean: 1000 },
    runway: { monthsCashOnly: 20 },
    budgetCurrencyNeedsReview: false,
  });
  await preference(session, 'GBP');
  const after = await runway(session);
  expect(after.burn).toEqual(before.burn);
  expect(after.runway).toEqual(before.runway);
  expect(after.tiers).toEqual(before.tiers);
  const rows = await read<BudgetCategory[]>(
    await integration.request('/api/budget/categories', { cookie: session.cookie }),
  );
  expect(
    rows.every((row) => row.currency === 'EUR' && row.budgeted === 1000 && row.spent === 1000),
  ).toBe(true);
  // Currency omission is a stable EUR API default, even after changing preference.
  const extra = await category(session, monthDates[0]!, undefined, 50, 'Other');
  expect(extra.budgeted).toBe(50);
  expect((await spending(session, extra.id, monthDates[0]!, undefined, 10)).amount).toBe(10);
});

test('EUR Bunq payments remain EUR with GBP display and repeat imports do not double count', async () => {
  const session = await fundedUser('bunq-eur');
  await preference(session, 'GBP');
  for (const [index, date] of monthDates.entries()) {
    const value = payment(100 + index, date);
    await importPayment(session, value);
    await importPayment(session, value);
  }
  expect(await runway(session)).toMatchObject({
    baseCurrency: 'EUR',
    burn: { lean: 1000 },
    runway: { monthsCashOnly: 20 },
  });
  const rows = await db
    .select()
    .from(budgetTransactions)
    .where(eq(budgetTransactions.userId, session.user.id));
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({
    currency: 'EUR',
    amount: 1000,
    sourceAmount: 1000,
    sourceCurrency: 'EUR',
    currencyNeedsReview: false,
  });
});

test('foreign manual budgets normalize at write time and remain stable across preference changes', async () => {
  const session = await fundedUser('manual-gbp');
  for (const date of monthDates) {
    const row = await category(session, date, 'GBP');
    expect(row).toMatchObject({ currency: 'EUR', budgeted: 1180 });
    expect(await spending(session, row.id, date, 'GBP')).toMatchObject({
      amount: 1180,
      sourceAmount: 1000,
      sourceCurrency: 'GBP',
      currency: 'EUR',
    });
  }
  const before = await runway(session);
  expect(before.burn.lean).toBe(1180);
  expect(before.runway.monthsCashOnly).toBeCloseTo(20000 / 1180, 8);
  await preference(session, 'USD');
  expect((await runway(session)).runway).toEqual(before.runway);
});

test('mixed-currency transaction edits, category moves and deletes apply EUR deltas', async () => {
  const session = await fundedUser('edits');
  const first = await category(session, monthDates[0]!, 'GBP');
  const second = await category(session, monthDates[0]!, 'USD', 100, 'Other');
  const transaction = await spending(session, first.id, monthDates[0]!, 'GBP', 100);
  const edited = await read<BudgetTransaction>(
    await integration.request(`/api/budget/transactions/${transaction.id}`, {
      method: 'PATCH',
      cookie: session.cookie,
      json: { amount: 50, currency: 'USD', categoryId: second.id },
    }),
  );
  expect(edited).toMatchObject({ amount: 46, sourceAmount: 50, sourceCurrency: 'USD' });
  const getCategory = (id: number) =>
    read<BudgetCategory>(
      integration.request(`/api/budget/categories/${id}`, { cookie: session.cookie }),
    );
  expect((await getCategory(first.id)).spent).toBe(0);
  expect((await getCategory(second.id)).spent).toBe(46);
  await read(
    await integration.request(`/api/budget/transactions/${transaction.id}`, {
      method: 'DELETE',
      cookie: session.cookie,
    }),
  );
  expect((await getCategory(second.id)).spent).toBe(0);
  const changed = await read<BudgetCategory>(
    await integration.request(`/api/budget/categories/${first.id}`, {
      method: 'PATCH',
      cookie: session.cookie,
      json: { budgeted: 200, spent: 50, currency: 'GBP' },
    }),
  );
  expect(changed).toMatchObject({ budgeted: 236, spent: 59, currency: 'EUR' });
});

test('legacy Bunq payments are repaired once using the payment currency and surface unresolved categories', async () => {
  const session = await fundedUser('legacy');
  for (const [index, date] of monthDates.entries()) {
    const row = await category(session, date, 'EUR', 0);
    await db
      .update(budgetCategories)
      .set({ spent: 1000, currencyNeedsReview: true })
      .where(eq(budgetCategories.id, row.id));
    await db.insert(budgetTransactions).values({
      userId: session.user.id,
      categoryId: row.id,
      amount: 1000,
      sourceAmount: 1000,
      description: 'Food',
      merchant: 'Food shop',
      currencyNeedsReview: true,
      date: date.toISOString().slice(0, 10),
      bunqTransactionId: String(200 + index),
    });
    const value = payment(200 + index, date, 'GBP');
    await importPayment(session, value);
    await importPayment(session, value);
    const [repaired] = await db
      .select()
      .from(budgetCategories)
      .where(eq(budgetCategories.id, row.id));
    expect(repaired).toMatchObject({ spent: 1180, currencyNeedsReview: true });
  }
  expect(await runway(session)).toMatchObject({
    burn: { lean: 1180 },
    budgetCurrencyNeedsReview: true,
    isEstimated: true,
  });
  const rows = await db
    .select()
    .from(budgetTransactions)
    .where(eq(budgetTransactions.userId, session.user.id));
  expect(
    rows.every(
      (row) => row.amount === 1180 && row.sourceCurrency === 'GBP' && !row.currencyNeedsReview,
    ),
  ).toBe(true);
});

test('foreign manual/Bunq matches use source currency and never match equal numbers in another currency', async () => {
  const session = await fundedUser('dedup');
  const row = await category(session, monthDates[0]!, 'GBP');
  const manual = await spending(session, row.id, monthDates[0]!, 'GBP');
  await importPayment(session, payment(300, monthDates[0]!, 'GBP'));
  await importPayment(session, payment(301, monthDates[0]!, 'EUR'));
  const transactions = await db
    .select()
    .from(budgetTransactions)
    .where(eq(budgetTransactions.userId, session.user.id));
  expect(transactions).toHaveLength(2);
  expect(transactions.find((entry) => entry.id === manual.id)).toMatchObject({
    amount: 1180,
    bunqTransactionId: '300',
    sourceCurrency: 'GBP',
  });
  expect(transactions.find((entry) => entry.bunqTransactionId === '301')?.amount).toBe(1000);
});

test('legacy flags survive partial edits and clear only on explicit monetary correction', async () => {
  const session = await fundedUser('review');
  const row = await category(session, monthDates[0]!, 'EUR');
  const transaction = await spending(session, row.id, monthDates[0]!, 'EUR');
  await db
    .update(budgetCategories)
    .set({ currencyNeedsReview: true })
    .where(eq(budgetCategories.id, row.id));
  await db
    .update(budgetTransactions)
    .set({ currencyNeedsReview: true, sourceCurrency: null })
    .where(eq(budgetTransactions.id, transaction.id));
  const updateCategory = (json: unknown) =>
    read<BudgetCategory>(
      integration.request(`/api/budget/categories/${row.id}`, {
        method: 'PATCH',
        cookie: session.cookie,
        json,
      }),
    );
  expect(await updateCategory({ name: 'Renamed', budgeted: 1000, currency: 'GBP' })).toMatchObject({
    budgeted: 1180,
    spent: 1000,
    currencyNeedsReview: true,
  });
  const updateTransaction = (json: unknown) =>
    read<BudgetTransaction>(
      integration.request(`/api/budget/transactions/${transaction.id}`, {
        method: 'PATCH',
        cookie: session.cookie,
        json,
      }),
    );
  expect((await updateTransaction({ description: 'Reviewed label' })).currencyNeedsReview).toBe(
    true,
  );
  expect(await updateTransaction({ amount: 1000, currency: 'GBP' })).toMatchObject({
    amount: 1180,
    currencyNeedsReview: false,
    sourceCurrency: 'GBP',
  });
  expect(await updateCategory({ budgeted: 1180, spent: 1180, currency: 'EUR' })).toMatchObject({
    currencyNeedsReview: false,
    spent: 1180,
  });
  expect((await runway(session)).budgetCurrencyNeedsReview).toBe(false);
});

test('foreign Bunq payments normalize before insertion and preserve native provenance', async () => {
  const session = await fundedUser('bunq-gbp');
  await preference(session, 'USD');
  await importPayment(session, payment(400, monthDates[0]!, 'GBP'));
  const [row] = await db
    .select()
    .from(budgetTransactions)
    .where(eq(budgetTransactions.userId, session.user.id));
  expect(row).toMatchObject({
    amount: 1180,
    currency: 'EUR',
    sourceAmount: 1000,
    sourceCurrency: 'GBP',
  });
  const [aggregate] = await db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.userId, session.user.id));
  expect(aggregate).toMatchObject({ spent: 1180, currency: 'EUR' });
});
