import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { toCents } from '@quro/shared';
import { db } from '../db/client';
import {
  mortgages,
  pensionStatementImportRows,
  pensionStatementImports,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { moneyLimitError } from '../lib/requestValidation';
import { toSignedSavingsAmount } from '../lib/savingsBalance';
import { createIntegrationHelpers, insertPartnerLink, type AuthSession } from '../test/integration';
import { parseHoldingCreate, parseHoldingTransactionCreate } from './holdings';

// The money input rule (docs/financial-invariants.md): money in a request is rounded to
// cents half away from zero when it is parsed, as numeric(19,2) stores it, and an absolute value
// of 10^13 or more is refused with a 400 that names the field. Unit prices, share quantities,
// rates and percentages are not money and keep their precision.

const integration = createIntegrationHelpers('money-input.integration.quro.test');
const DATE = '2026-03-02';
const LIMIT = 10_000_000_000_000;
const JUST_BELOW = 9_999_999_999_999.99;

let owner: AuthSession;

beforeAll(async () => {
  await integration.cleanup();
  owner = await integration.signUp('owner');
  const partner = await integration.signUp('partner');
  await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
});
afterAll(() => integration.cleanup());

function send(method: string, path: string, json?: unknown) {
  return integration.request(path, { method, cookie: owner.cookie, json });
}

async function created<T = { id: number }>(path: string, json: unknown): Promise<T> {
  const response = await send('POST', path, json);
  if (response.status !== 201) {
    throw new Error(`POST ${path}: ${response.status} ${await response.text()}`);
  }
  return ((await response.json()) as { data: T }).data;
}

async function data<T>(response: Response): Promise<T> {
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return ((await response.json()) as { data: T }).data;
}

const savingsAccount = (balance: number) =>
  created('/api/savings/accounts', {
    name: 'Money input',
    bank: 'Synthetic Bank',
    balance,
    currency: 'EUR',
    interestRate: 1,
    accountType: 'Easy Access',
    color: '#0ea5e9',
    emoji: 'S',
  });

describe('half-cent amounts', () => {
  test('a half-cent deposit across zero stores the same cents in the row and the balance', async () => {
    const account = await savingsAccount(0);
    await created('/api/savings/transactions', {
      accountId: account.id,
      type: 'withdrawal',
      amount: 20,
      date: DATE,
    });
    const deposit = await created<{ id: number; amount: number }>('/api/savings/transactions', {
      accountId: account.id,
      type: 'deposit',
      amount: 10.005,
      date: DATE,
    });
    // Rounded half away from zero when parsed, as numeric(19,2) would store it.
    expect(deposit.amount).toBe(10.01);

    const balance = async () => {
      const [row] = await db
        .select()
        .from(savingsAccounts)
        .where(eq(savingsAccounts.id, account.id));
      return toCents(row!.balance);
    };
    const ledger = await db
      .select()
      .from(savingsTransactions)
      .where(eq(savingsTransactions.accountId, account.id));
    const ledgerCents = ledger.reduce(
      (sum, txn) => sum + toCents(toSignedSavingsAmount(txn.type, txn.amount)),
      0,
    );
    // Before the rule the balance became -10.00 while the ledger summed to -9.99.
    expect(await balance()).toBe(-999);
    expect(ledgerCents).toBe(-999);

    await data(await send('DELETE', `/api/savings/transactions/${deposit.id}`));
    expect(await balance()).toBe(-2000);
  });

  test('negative half cents round away from zero too', async () => {
    const pot = await created('/api/pensions/pots', {
      name: 'Pot',
      provider: 'Synthetic Provider',
      type: 'Workplace Pension',
      balance: 1_000.005,
      currency: 'EUR',
      employeeMonthly: 0,
      employerMonthly: 0,
      investmentStrategy: 'Balanced',
      color: '#1d4ed8',
      emoji: 'P',
    });
    const statement = await created<{ amount: number }>('/api/pensions/transactions', {
      potId: pot.id,
      type: 'annual_statement',
      amount: -0.125,
      date: DATE,
    });
    expect(statement.amount).toBe(-0.13);
    const pots = await data<Array<{ id: number; balance: number }>>(
      await send('GET', '/api/pensions/pots'),
    );
    expect(pots.find((row) => row.id === pot.id)!.balance).toBe(1_000.01 - 0.13);
  });

  test('an amount that rounds to zero is not greater than zero', async () => {
    const account = await savingsAccount(10);
    const response = await send('POST', '/api/savings/transactions', {
      accountId: account.id,
      type: 'deposit',
      amount: 0.004,
      date: DATE,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Transaction amount must be greater than zero',
    });
  });
});

describe('the 10^13 limit', () => {
  test('just below the limit is accepted and stored exactly; the limit is refused', async () => {
    const account = await savingsAccount(JUST_BELOW);
    const [row] = await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, account.id));
    expect(row!.balance).toBe(JUST_BELOW);

    for (const balance of [LIMIT, -LIMIT, '9999999999999.995', 1e21]) {
      const response = await send('PATCH', `/api/savings/accounts/${account.id}`, { balance });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: moneyLimitError('balance') });
    }
    const [after] = await db
      .select()
      .from(savingsAccounts)
      .where(eq(savingsAccounts.id, account.id));
    expect(after!.balance).toBe(JUST_BELOW);
  });

  test('every family of money fields refuses the limit and names the field', async () => {
    const account = await savingsAccount(100);
    const savingsTxn = await created('/api/savings/transactions', {
      accountId: account.id,
      type: 'deposit',
      amount: 10,
      date: DATE,
    });
    const category = await created('/api/budget/categories', {
      name: 'Groceries',
      emoji: 'G',
      budgeted: 100,
      spent: 0,
      color: '#f59e0b',
      month: 'Mar',
      year: 2026,
    });
    const budgetTxn = await created('/api/budget/transactions', {
      categoryId: category.id,
      description: 'Shop',
      amount: 10,
      date: DATE,
      merchant: 'Synthetic Market',
    });
    const pot = await created('/api/pensions/pots', {
      name: 'Pot',
      provider: 'Synthetic Provider',
      type: 'Workplace Pension',
      balance: 100,
      currency: 'EUR',
      employeeMonthly: 0,
      employerMonthly: 0,
      investmentStrategy: 'Balanced',
      color: '#1d4ed8',
      emoji: 'P',
    });
    const pensionTxn = await created('/api/pensions/transactions', {
      potId: pot.id,
      type: 'fee',
      amount: 5,
      date: DATE,
    });
    const [importRecord] = await db
      .insert(pensionStatementImports)
      .values({
        userId: owner.user.id,
        potId: pot.id,
        status: 'ready_for_review',
        storageKey: `synthetic/${crypto.randomUUID()}.pdf`,
        fileName: 'synthetic.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        fileHashSha256: crypto.randomUUID().replaceAll('-', ''),
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    const [importRow] = await db
      .insert(pensionStatementImportRows)
      .values({
        importId: importRecord!.id,
        rowOrder: 0,
        type: 'annual_statement',
        amount: 10,
        date: DATE,
      })
      .returning();
    const home = await created('/api/investments/properties', {
      address: '1 Limit Road',
      propertyType: 'primary_home',
      purchasePrice: 200_000,
      currentValue: 210_000,
      monthlyRent: 0,
      currency: 'EUR',
      emoji: 'H',
    });
    const valuation = await created('/api/investments/property-transactions', {
      propertyId: home.id,
      type: 'valuation',
      amount: 210_000,
      date: DATE,
    });
    const mortgage = await created('/api/mortgages', {
      linkedPropertyId: home.id,
      lender: 'Synthetic Lender',
      originalAmount: 150_000,
      outstandingBalance: 120_000,
      propertyValue: 210_000,
      monthlyPayment: 800,
      interestRate: 3,
      rateType: 'fixed',
      fixedUntil: '2030-01-01',
      termYears: 25,
      startDate: '2026-01-01',
      endDate: '2051-01-01',
    });
    const mortgageTxn = await created('/api/mortgages/transactions', {
      mortgageId: mortgage.id,
      type: 'repayment',
      amount: 800,
      interest: 300,
      principal: 500,
      date: DATE,
    });
    const debt = await created('/api/debts', {
      name: 'Loan',
      type: 'personal_loan',
      lender: 'Synthetic Lender',
      originalAmount: 5_000,
      remainingBalance: 4_000,
      currency: 'EUR',
      interestRate: 5,
      monthlyPayment: 200,
      startDate: '2026-01-01',
      color: '#ef4444',
      emoji: 'D',
    });
    const payslip = await created('/api/salary/payslips', {
      month: 'March 2026',
      date: '2026-03-31',
      gross: 5_000,
      tax: 1_000,
      pension: 200,
      net: 3_800,
      bonus: null,
      currency: 'EUR',
    });
    const goal = await created('/api/goals', {
      type: 'savings',
      name: 'Buffer',
      emoji: 'B',
      currentAmount: 100,
      targetAmount: 1_000,
      deadline: '2026-12',
      year: 2026,
      category: 'Safety Net',
      monthlyContribution: 50,
      monthlyTarget: 60,
      monthsCompleted: 1,
      totalMonths: 12,
      unit: null,
      color: '#2563eb',
      currency: 'EUR',
    });

    const cases: Array<{ method: string; path: string; field: string; body?: object }> = [
      { method: 'PATCH', path: `/api/savings/accounts/${account.id}`, field: 'balance' },
      {
        method: 'PATCH',
        path: `/api/savings/accounts/${account.id}/banking-entity`,
        field: 'cap',
        body: { mode: 'manual', entityName: 'Synthetic Bank NV', scheme: 'DGS', currency: 'EUR' },
      },
      { method: 'PATCH', path: `/api/savings/transactions/${savingsTxn.id}`, field: 'amount' },
      { method: 'PATCH', path: `/api/budget/categories/${category.id}`, field: 'budgeted' },
      { method: 'PATCH', path: `/api/budget/categories/${category.id}`, field: 'spent' },
      { method: 'PATCH', path: `/api/budget/transactions/${budgetTxn.id}`, field: 'amount' },
      { method: 'PATCH', path: `/api/pensions/pots/${pot.id}`, field: 'balance' },
      { method: 'PATCH', path: `/api/pensions/pots/${pot.id}`, field: 'employeeMonthly' },
      { method: 'PATCH', path: `/api/pensions/pots/${pot.id}`, field: 'employerMonthly' },
      { method: 'PATCH', path: `/api/pensions/transactions/${pensionTxn.id}`, field: 'amount' },
      {
        method: 'PATCH',
        path: `/api/pensions/imports/${importRecord!.id}/rows/${importRow!.id}`,
        field: 'amount',
      },
      { method: 'PATCH', path: `/api/investments/properties/${home.id}`, field: 'currentValue' },
      { method: 'PATCH', path: `/api/investments/properties/${home.id}`, field: 'purchasePrice' },
      { method: 'PATCH', path: `/api/investments/properties/${home.id}`, field: 'monthlyRent' },
      {
        method: 'PATCH',
        path: `/api/investments/property-transactions/${valuation.id}`,
        field: 'amount',
      },
      { method: 'PATCH', path: `/api/mortgages/${mortgage.id}`, field: 'outstandingBalance' },
      { method: 'PATCH', path: `/api/mortgages/${mortgage.id}`, field: 'monthlyPayment' },
      { method: 'PATCH', path: `/api/mortgages/transactions/${mortgageTxn.id}`, field: 'amount' },
      { method: 'PATCH', path: `/api/mortgages/transactions/${mortgageTxn.id}`, field: 'interest' },
      { method: 'PATCH', path: `/api/debts/${debt.id}`, field: 'remainingBalance' },
      { method: 'PATCH', path: `/api/debts/${debt.id}`, field: 'monthlyPayment' },
      {
        method: 'POST',
        path: '/api/debts/payments',
        field: 'amount',
        body: { debtId: debt.id, interest: 0, date: DATE },
      },
      { method: 'PATCH', path: `/api/salary/payslips/${payslip.id}`, field: 'gross' },
      { method: 'PATCH', path: `/api/salary/payslips/${payslip.id}`, field: 'bonus' },
      { method: 'PATCH', path: `/api/goals/${goal.id}`, field: 'targetAmount' },
      { method: 'PATCH', path: `/api/goals/${goal.id}`, field: 'monthlyTarget' },
      { method: 'PUT', path: '/api/plan/assumptions', field: 'leanBurnOverride' },
      { method: 'PUT', path: '/api/plan/assumptions', field: 'benefitMonthlyOverride' },
      { method: 'PUT', path: '/api/plan/assumptions', field: 'severanceMonthlySalaryOverride' },
    ];
    for (const { method, path, field, body } of cases) {
      const response = await send(method, path, { ...body, [field]: LIMIT });
      expect({ path, field, status: response.status, body: await response.json() }).toEqual({
        path,
        field,
        status: 400,
        body: { error: moneyLimitError(field) },
      });
    }
  });
});

describe('values that are not money keep their precision', () => {
  test('a unit price with four decimals and a six-decimal quantity are not rounded', () => {
    const transaction = parseHoldingTransactionCreate({
      holdingId: 1,
      type: 'buy',
      shares: 1.234567,
      price: 123.4567,
      date: DATE,
    });
    expect(transaction.ok && transaction.value).toMatchObject({
      shares: 1.234567,
      price: 123.4567,
    });
    const holding = parseHoldingCreate({
      name: 'Synthetic',
      ticker: 'SYN',
      currentPrice: '0.0045',
      currency: 'EUR',
      sector: 'Index',
      manualPrice: 12.3456,
    });
    expect(holding.ok && holding.value).toMatchObject({
      currentPrice: 0.0045,
      manualPrice: 12.3456,
    });
  });

  test('a mortgage rate change keeps its rate precision while money on the mortgage is rounded', async () => {
    const home = await created('/api/investments/properties', {
      address: '2 Rate Road',
      propertyType: 'primary_home',
      purchasePrice: 200_000,
      currentValue: 210_000,
      monthlyRent: 0,
      currency: 'EUR',
      emoji: 'H',
    });
    const mortgage = await created<{ id: number; outstandingBalance: number }>('/api/mortgages', {
      linkedPropertyId: home.id,
      lender: 'Synthetic Lender',
      originalAmount: 150_000,
      outstandingBalance: 120_000.125,
      propertyValue: 210_000,
      monthlyPayment: 800,
      interestRate: 3,
      rateType: 'fixed',
      fixedUntil: '2030-01-01',
      termYears: 25,
      startDate: '2026-01-01',
      endDate: '2051-01-01',
    });
    expect(mortgage.outstandingBalance).toBe(120_000.13);
    await created('/api/mortgages/transactions', {
      mortgageId: mortgage.id,
      type: 'rate_change',
      amount: 3.8755,
      fixedYears: 5,
      date: DATE,
    });
    const [row] = await db.select().from(mortgages).where(eq(mortgages.id, mortgage.id));
    expect(row!.interestRate).toBe(3.8755);
  });
});
