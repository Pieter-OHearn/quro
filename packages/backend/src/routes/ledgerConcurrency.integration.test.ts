import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { toCents } from '@quro/shared';
import { db } from '../db/client';
import {
  budgetCategories,
  budgetTransactions,
  debtPayments,
  debts,
  mortgageTransactions,
  mortgages,
  pensionPots,
  pensionStatementImportRows,
  pensionStatementImports,
  pensionTransactions,
  properties,
  propertyTransactions,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { computePensionTransactionDelta } from '../lib/pensionTransactions';
import { toSignedSavingsAmount } from '../lib/savingsBalance';
import { createIntegrationHelpers, type AuthSession } from '../test/integration';

// Two requests that change or remove the same ledger row at the same moment (a double click,
// two tabs, both partners) must leave the parent balance equal to what the remaining ledger
// rows say. Each scenario repeats a few times because the requests race for real.

const integration = createIntegrationHelpers('ledger-concurrency.integration.quro.test');
const ROUNDS = 3;
const DATE = '2026-03-02';

beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());

async function created<T>(response: Response): Promise<T> {
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: T }).data;
}

function post(session: AuthSession, path: string, json: unknown) {
  return integration.request(path, { method: 'POST', cookie: session.cookie, json });
}

function patch(session: AuthSession, path: string, json: unknown) {
  return integration.request(path, { method: 'PATCH', cookie: session.cookie, json });
}

function remove(session: AuthSession, path: string) {
  return integration.request(path, { method: 'DELETE', cookie: session.cookie });
}

// Exactly one of two identical deletes may succeed; the other finds nothing to delete.
async function deleteTwiceAtOnce(session: AuthSession, path: string): Promise<void> {
  const statuses = (await Promise.all([remove(session, path), remove(session, path)]))
    .map((response) => response.status)
    .sort();
  expect(statuses).toEqual([200, 404]);
}

async function editTwiceAtOnce(
  session: AuthSession,
  path: string,
  first: unknown,
  second: unknown,
): Promise<void> {
  const statuses = await Promise.all([patch(session, path, first), patch(session, path, second)]);
  expect(statuses.map((response) => response.status)).toEqual([200, 200]);
}

const sumCents = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + toCents(value), 0);

describe('concurrent edits and deletes of one ledger row', () => {
  test('savings: the balance stays the opening balance plus the remaining ledger', async () => {
    const owner = await integration.signUp('savings');
    const account = await created<{ id: number }>(
      await post(owner, '/api/savings/accounts', {
        name: 'Race savings',
        bank: 'Synthetic Bank',
        balance: 1000,
        currency: 'EUR',
        interestRate: 1,
        accountType: 'Easy Access',
        color: '#0ea5e9',
        emoji: 'S',
      }),
    );
    for (let round = 0; round < ROUNDS; round += 1) {
      const edited = await created<{ id: number }>(
        await post(owner, '/api/savings/transactions', {
          accountId: account.id,
          type: 'deposit',
          amount: 100,
          date: DATE,
        }),
      );
      await editTwiceAtOnce(
        owner,
        `/api/savings/transactions/${edited.id}`,
        { amount: 150 },
        { amount: 200 },
      );
      const deleted = await created<{ id: number }>(
        await post(owner, '/api/savings/transactions', {
          accountId: account.id,
          type: 'withdrawal',
          amount: 40,
          date: DATE,
        }),
      );
      await deleteTwiceAtOnce(owner, `/api/savings/transactions/${deleted.id}`);
    }

    const [row] = await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, account.id));
    const ledger = await db
      .select()
      .from(savingsTransactions)
      .where(eq(savingsTransactions.accountId, account.id));
    expect(ledger).toHaveLength(ROUNDS);
    expect(toCents(row!.balance)).toBe(
      toCents(1000) + sumCents(ledger.map((txn) => toSignedSavingsAmount(txn.type, txn.amount))),
    );
  });

  test('budget: category spending stays its opening amount plus its transactions', async () => {
    const owner = await integration.signUp('budget');
    const category = await created<{ id: number }>(
      await post(owner, '/api/budget/categories', {
        name: 'Race groceries',
        emoji: 'G',
        budgeted: 500,
        spent: 0,
        color: '#f59e0b',
        month: 'Mar',
        year: 2026,
      }),
    );

    for (let round = 0; round < ROUNDS; round += 1) {
      const edited = await created<{ id: number }>(
        await post(owner, '/api/budget/transactions', {
          categoryId: category.id,
          description: 'Weekly shop',
          amount: 100,
          date: DATE,
          merchant: 'Synthetic Market',
        }),
      );
      await editTwiceAtOnce(
        owner,
        `/api/budget/transactions/${edited.id}`,
        { amount: 150 },
        { amount: 200 },
      );
      const deleted = await created<{ id: number }>(
        await post(owner, '/api/budget/transactions', {
          categoryId: category.id,
          description: 'Snack',
          amount: 5,
          date: DATE,
          merchant: 'Synthetic Market',
        }),
      );
      await deleteTwiceAtOnce(owner, `/api/budget/transactions/${deleted.id}`);
    }

    const [row] = await db
      .select()
      .from(budgetCategories)
      .where(eq(budgetCategories.id, category.id));
    const ledger = await db
      .select()
      .from(budgetTransactions)
      .where(eq(budgetTransactions.categoryId, category.id));
    expect(ledger).toHaveLength(ROUNDS);
    expect(toCents(row!.spent)).toBe(sumCents(ledger.map((txn) => txn.amount)));
  });

  test('pension: the pot balance stays the opening balance plus the remaining ledger', async () => {
    const owner = await integration.signUp('pension');
    const pot = await created<{ id: number }>(
      await post(owner, '/api/pensions/pots', {
        name: 'Race pension',
        provider: 'Synthetic Provider',
        type: 'Workplace Pension',
        balance: 5000,
        currency: 'EUR',
        employeeMonthly: 100,
        employerMonthly: 100,
        investmentStrategy: 'Balanced',
        color: '#1d4ed8',
        emoji: 'P',
      }),
    );
    const contribution = {
      potId: pot.id,
      type: 'contribution',
      amount: 300,
      taxAmount: 50,
      date: DATE,
      isEmployer: false,
    };

    for (let round = 0; round < ROUNDS; round += 1) {
      const edited = await created<{ id: number }>(
        await post(owner, '/api/pensions/transactions', contribution),
      );
      await editTwiceAtOnce(
        owner,
        `/api/pensions/transactions/${edited.id}`,
        { amount: 400 },
        { amount: 500, taxAmount: 0 },
      );
      const deleted = await created<{ id: number }>(
        await post(owner, '/api/pensions/transactions', contribution),
      );
      await deleteTwiceAtOnce(owner, `/api/pensions/transactions/${deleted.id}`);
    }

    const [row] = await db.select().from(pensionPots).where(eq(pensionPots.id, pot.id));
    const ledger = await db
      .select()
      .from(pensionTransactions)
      .where(eq(pensionTransactions.potId, pot.id));
    expect(ledger).toHaveLength(ROUNDS);
    expect(toCents(row!.balance)).toBe(
      toCents(5000) + sumCents(ledger.map((txn) => computePensionTransactionDelta(txn))),
    );
  });

  test('mortgage: the outstanding balance and the linked property debt follow the ledger', async () => {
    const owner = await integration.signUp('mortgage');
    const property = await created<{ id: number }>(
      await post(owner, '/api/investments/properties', {
        address: '1 Race Street',
        propertyType: 'primary_home',
        purchasePrice: 300000,
        currentValue: 320000,
        monthlyRent: 0,
        currency: 'EUR',
        emoji: 'H',
      }),
    );
    const mortgage = await created<{ id: number }>(
      await post(owner, '/api/mortgages', {
        linkedPropertyId: property.id,
        lender: 'Synthetic Lender',
        originalAmount: 200000,
        outstandingBalance: 200000,
        propertyValue: 320000,
        monthlyPayment: 1000,
        interestRate: 3,
        rateType: 'fixed',
        fixedUntil: '2030-01-01',
        termYears: 30,
        startDate: '2026-01-01',
        endDate: '2056-01-01',
        overpaymentLimit: 10,
      }),
    );
    const repayment = {
      mortgageId: mortgage.id,
      type: 'repayment',
      amount: 1000,
      interest: 400,
      principal: 600,
      date: DATE,
    };

    for (let round = 0; round < ROUNDS; round += 1) {
      const edited = await created<{ id: number }>(
        await post(owner, '/api/mortgages/transactions', repayment),
      );
      await editTwiceAtOnce(
        owner,
        `/api/mortgages/transactions/${edited.id}`,
        { amount: 1100, principal: 700 },
        { amount: 1200, principal: 800 },
      );
      const deleted = await created<{ id: number }>(
        await post(owner, '/api/mortgages/transactions', repayment),
      );
      await deleteTwiceAtOnce(owner, `/api/mortgages/transactions/${deleted.id}`);
    }

    const [row] = await db.select().from(mortgages).where(eq(mortgages.id, mortgage.id));
    const ledger = await db
      .select()
      .from(mortgageTransactions)
      .where(eq(mortgageTransactions.mortgageId, mortgage.id));
    expect(ledger).toHaveLength(ROUNDS);
    expect(toCents(row!.outstandingBalance)).toBe(
      toCents(200000) - sumCents(ledger.map((txn) => txn.principal ?? 0)),
    );
    const read = await integration.request(`/api/investments/properties/${property.id}`, {
      cookie: owner.cookie,
    });
    const linked = ((await read.json()) as { data: { mortgage: number } }).data;
    expect(toCents(linked.mortgage)).toBe(toCents(row!.outstandingBalance));
  });

  test('property: the manual debt of an unlinked property follows its repayments', async () => {
    const owner = await integration.signUp('property');
    const property = await created<{ id: number }>(
      await post(owner, '/api/investments/properties', {
        address: '2 Race Street',
        propertyType: 'primary_home',
        purchasePrice: 250000,
        currentValue: 260000,
        mortgage: 150000,
        monthlyRent: 0,
        currency: 'EUR',
        emoji: 'P',
      }),
    );
    const repayment = {
      propertyId: property.id,
      type: 'repayment',
      amount: 900,
      interest: 300,
      principal: 600,
      date: DATE,
    };

    for (let round = 0; round < ROUNDS; round += 1) {
      const edited = await created<{ id: number }>(
        await post(owner, '/api/investments/property-transactions', repayment),
      );
      await editTwiceAtOnce(
        owner,
        `/api/investments/property-transactions/${edited.id}`,
        { amount: 1000, principal: 700 },
        { amount: 1100, principal: 800 },
      );
      const deleted = await created<{ id: number }>(
        await post(owner, '/api/investments/property-transactions', repayment),
      );
      await deleteTwiceAtOnce(owner, `/api/investments/property-transactions/${deleted.id}`);
    }

    const [row] = await db.select().from(properties).where(eq(properties.id, property.id));
    const ledger = await db
      .select()
      .from(propertyTransactions)
      .where(eq(propertyTransactions.propertyId, property.id));
    expect(ledger).toHaveLength(ROUNDS);
    expect(toCents(row!.mortgage)).toBe(
      toCents(150000) - sumCents(ledger.map((txn) => txn.principal ?? 0)),
    );
  });

  test('debt: the remaining balance follows the remaining payments', async () => {
    const owner = await integration.signUp('debt');
    const debt = await created<{ id: number }>(
      await post(owner, '/api/debts', {
        name: 'Race loan',
        type: 'personal_loan',
        lender: 'Synthetic Lender',
        originalAmount: 10000,
        remainingBalance: 10000,
        currency: 'EUR',
        interestRate: 5,
        monthlyPayment: 300,
        startDate: '2026-01-01',
        color: '#ef4444',
        emoji: 'D',
      }),
    );

    for (let round = 0; round < ROUNDS; round += 1) {
      await created(
        await post(owner, '/api/debts/payments', {
          debtId: debt.id,
          amount: 300,
          interest: 50,
          date: DATE,
        }),
      );
      const deleted = await created<{ id: number }>(
        await post(owner, '/api/debts/payments', {
          debtId: debt.id,
          amount: 300,
          interest: 50,
          date: DATE,
        }),
      );
      await deleteTwiceAtOnce(owner, `/api/debts/payments/${deleted.id}`);
    }

    const [row] = await db.select().from(debts).where(eq(debts.id, debt.id));
    const ledger = await db.select().from(debtPayments).where(eq(debtPayments.debtId, debt.id));
    expect(ledger).toHaveLength(ROUNDS);
    expect(toCents(row!.remainingBalance)).toBe(
      toCents(10000) - sumCents(ledger.map((payment) => payment.principal)),
    );
  });
});

test('a reviewed pension statement commits once when two commits race', async () => {
  const owner = await integration.signUp('import');
  const pot = await created<{ id: number }>(
    await post(owner, '/api/pensions/pots', {
      name: 'Imported pension',
      provider: 'Synthetic Provider',
      type: 'Workplace Pension',
      balance: 1000,
      currency: 'EUR',
      employeeMonthly: 0,
      employerMonthly: 0,
      investmentStrategy: 'Balanced',
      color: '#1d4ed8',
      emoji: 'I',
    }),
  );
  const [record] = await db
    .insert(pensionStatementImports)
    .values({
      userId: owner.user.id,
      potId: pot.id,
      status: 'ready_for_review',
      storageKey: `synthetic/${crypto.randomUUID()}.pdf`,
      fileName: 'synthetic-statement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      fileHashSha256: crypto.randomUUID().replaceAll('-', ''),
      statementPeriodStart: '2025-01-01',
      statementPeriodEnd: '2025-12-31',
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  await db.insert(pensionStatementImportRows).values([
    {
      importId: record!.id,
      rowOrder: 0,
      type: 'contribution',
      amount: 1200,
      taxAmount: 0,
      date: '2025-06-30',
      isEmployer: true,
    },
    {
      importId: record!.id,
      rowOrder: 1,
      type: 'annual_statement',
      amount: 300,
      date: '2025-12-31',
    },
  ]);

  const statuses = (
    await Promise.all([
      post(owner, `/api/pensions/imports/${record!.id}/commit`, {}),
      post(owner, `/api/pensions/imports/${record!.id}/commit`, {}),
    ])
  )
    .map((response) => response.status)
    .sort();

  expect(statuses[0]).toBe(200);
  expect(statuses[1]).toBeGreaterThanOrEqual(400);
  const ledger = await db
    .select()
    .from(pensionTransactions)
    .where(eq(pensionTransactions.potId, pot.id));
  expect(ledger).toHaveLength(2);
  const [row] = await db.select().from(pensionPots).where(eq(pensionPots.id, pot.id));
  expect(toCents(row!.balance)).toBe(toCents(1000 + 1200 + 300));
});
