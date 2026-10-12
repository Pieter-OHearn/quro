import { describe, expect, test } from 'bun:test';
import { toCents } from '@quro/shared';
import {
  BUDGET_CATEGORIES,
  DEPOSIT_PROTECTION,
  RATE_HISTORY_FIRST_DAY,
  RATE_HISTORY_LAST_DAY,
  buildSeedRateHistory,
  rateHistoryDays,
  BUDGET_MONTHS,
  DEBTS,
  DEMO_PARTNER_PROFILE,
  EMPLOYMENTS,
  GOALS,
  HOLDINGS,
  HOUSEHOLD_AS_OF,
  HOUSEHOLD_EMAILS,
  MORTGAGE,
  PENSION_POTS,
  PROPERTIES,
  SAVINGS_ACCOUNTS,
  amortise,
  budgetCategoryMonths,
  budgetTransactions,
  expectedDebtBalance,
  expectedMortgageBalance,
  expectedPensionBalance,
  expectedPropertyDebt,
  expectedSavingsBalance,
  expectedShares,
} from './demoHousehold';
import { buildSeedCurrencyRates, DEMO_USER_PROFILE } from './demoSeed';
import { DEMO_PARTNER_EMAIL, DEMO_USER_EMAIL, DEMO_USER_EMAILS } from './maintenance';

// The household is data, so its shape is checked without a database: what it contains, that it is
// plausible and that every amount is a whole number of cents. The seeded rows are checked in
// seedHousehold.integration.test.ts.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SHARE_DECIMALS = 6;

const hasAtMostDecimals = (value: number, decimals: number) =>
  Math.abs(value * 10 ** decimals - Math.round(value * 10 ** decimals)) < 1e-6;
const isMoney = (value: number) => hasAtMostDecimals(value, 2);

/** Every dated ledger row in the household, with where it comes from. */
function datedRows(): { source: string; date: string }[] {
  return [
    ...SAVINGS_ACCOUNTS.flatMap((a) =>
      a.transactions.map((t) => ({ source: a.key, date: t.date })),
    ),
    ...HOLDINGS.flatMap((h) => h.transactions.map((t) => ({ source: h.key, date: t.date }))),
    ...HOLDINGS.flatMap((h) => h.priceHistory.map(([date]) => ({ source: h.key, date }))),
    ...PROPERTIES.flatMap((p) => p.transactions.map((t) => ({ source: p.key, date: t.date }))),
    ...MORTGAGE.repayments.map((r) => ({ source: 'mortgage', date: r.date })),
    { source: 'rate change', date: MORTGAGE.rateChange.date },
    ...PENSION_POTS.flatMap((p) => p.transactions.map((t) => ({ source: p.key, date: t.date }))),
    ...DEBTS.flatMap((d) => d.payments.map((t) => ({ source: d.key, date: t.date }))),
    ...EMPLOYMENTS.flatMap((e) => e.payslips.map((t) => ({ source: e.key, date: t.date }))),
    ...budgetTransactions().map((t) => ({ source: t.categoryName, date: t.date })),
  ];
}

describe('demo household data', () => {
  test('names two demo users on a non-routable domain', () => {
    expect(DEMO_PARTNER_PROFILE.email).toBe(DEMO_PARTNER_EMAIL);
    expect(DEMO_PARTNER_EMAIL).not.toBe(DEMO_USER_EMAIL);
    expect([...HOUSEHOLD_EMAILS] as string[]).toEqual([...DEMO_USER_EMAILS]);
    for (const email of HOUSEHOLD_EMAILS) expect(email.endsWith('@quro.local')).toBe(true);
    expect(DEMO_PARTNER_PROFILE.email).not.toBe(DEMO_USER_PROFILE.email);
  });

  test('is dated on real days, none after the as-of date or in the future', () => {
    const rows = datedRows();
    expect(rows.length).toBeGreaterThan(300);
    expect(Date.parse(`${HOUSEHOLD_AS_OF}T00:00:00Z`)).toBeLessThan(Date.now());
    for (const row of rows) {
      expect(row.date).toMatch(ISO_DATE);
      expect(new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(row.date);
      expect(row.date <= HOUSEHOLD_AS_OF).toBe(true);
    }
  });

  test('uses cents for money and at most six decimals for shares', () => {
    const money: number[] = [
      ...SAVINGS_ACCOUNTS.flatMap((a) => [
        a.openingBalance,
        ...a.transactions.map((t) => t.amount),
      ]),
      ...HOLDINGS.flatMap((h) => [
        h.currentPrice,
        ...h.transactions.map((t) => t.price),
        ...h.priceHistory.map(([, close]) => close),
      ]),
      ...PROPERTIES.flatMap((p) => [
        p.purchasePrice,
        p.currentValue,
        p.manualMortgage,
        p.monthlyRent,
        ...p.transactions.map((t) => t.amount),
      ]),
      MORTGAGE.originalAmount,
      MORTGAGE.openingBalance,
      MORTGAGE.monthlyPayment,
      ...MORTGAGE.repayments.flatMap((r) => [r.amount, r.interest]),
      ...PENSION_POTS.flatMap((p) => [
        p.openingBalance,
        ...p.transactions.flatMap((t) => [t.amount, t.taxAmount]),
      ]),
      ...DEBTS.flatMap((d) => [
        d.originalAmount,
        d.openingBalance,
        d.monthlyPayment,
        ...d.payments.flatMap((p) => [p.amount, p.interest]),
      ]),
      ...EMPLOYMENTS.flatMap((e) =>
        e.payslips.flatMap((p) => [p.gross, p.tax, p.pension, p.net, p.bonus ?? 0]),
      ),
      ...GOALS.flatMap((g) => [
        g.targetAmount,
        g.monthlyContribution,
        ...(typeof g.currentAmount === 'number' ? [g.currentAmount] : []),
      ]),
      ...BUDGET_CATEGORIES.map((c) => c.budgeted),
      ...budgetTransactions().map((t) => t.amount),
    ];
    for (const value of money) expect(isMoney(value)).toBe(true);
    const shares = HOLDINGS.flatMap((h) => h.transactions.map((t) => t.shares ?? 0));
    for (const value of shares) expect(hasAtMostDecimals(value, MAX_SHARE_DECIMALS)).toBe(true);
  });

  test('keeps seeded prices at two decimals, which holds before and after prices widen', () => {
    for (const holding of HOLDINGS) {
      for (const [, close] of holding.priceHistory) expect(isMoney(close)).toBe(true);
      expect(isMoney(holding.currentPrice)).toBe(true);
      expect(holding.priceHistory.at(-1)).toEqual([HOUSEHOLD_AS_OF, holding.currentPrice]);
    }
  });

  test('spans several currencies', () => {
    const currencies = new Set<string>([
      ...SAVINGS_ACCOUNTS.map((a) => a.currency),
      ...HOLDINGS.map((h) => h.currency),
      ...PROPERTIES.map((p) => p.currency),
      ...PENSION_POTS.map((p) => p.currency),
      ...DEBTS.map((d) => d.currency),
      ...EMPLOYMENTS.map((e) => e.currency),
    ]);
    for (const currency of ['EUR', 'GBP', 'USD']) expect(currencies.has(currency)).toBe(true);
    expect(budgetTransactions().some((t) => t.currency === 'GBP')).toBe(true);
  });

  test('has private and joint rows on both sides', () => {
    for (const owner of ['demo', 'partner'] as const) {
      const accounts = SAVINGS_ACCOUNTS.filter((a) => a.owner === owner);
      expect(accounts.some((a) => a.isJoint)).toBe(true);
      expect(accounts.some((a) => !a.isJoint)).toBe(true);
      expect(PENSION_POTS.some((p) => p.owner === owner)).toBe(true);
      expect(DEBTS.some((d) => d.owner === owner)).toBe(true);
      expect(EMPLOYMENTS.some((e) => e.owner === owner)).toBe(true);
    }
    expect(PROPERTIES.some((p) => p.isJoint)).toBe(true);
    expect(PROPERTIES.some((p) => !p.isJoint)).toBe(true);
    expect(MORTGAGE.isJoint).toBe(true);
    // Both partners write to a joint ledger.
    const jointAuthors = SAVINGS_ACCOUNTS.filter((a) => a.isJoint).flatMap((a) =>
      a.transactions.map((t) => t.by),
    );
    expect(new Set(jointAuthors)).toEqual(new Set(['demo', 'partner']));
    expect(new Set(MORTGAGE.repayments.map((r) => r.by))).toEqual(new Set(['demo', 'partner']));
  });

  test('covers every ledger type the pages show', () => {
    const types = (rows: readonly { type: string }[]) => new Set(rows.map((row) => row.type));
    expect(types(SAVINGS_ACCOUNTS.flatMap((a) => [...a.transactions]))).toEqual(
      new Set(['deposit', 'withdrawal', 'interest']),
    );
    expect(types(HOLDINGS.flatMap((h) => [...h.transactions]))).toEqual(
      new Set(['buy', 'sell', 'dividend']),
    );
    expect(types(PENSION_POTS.flatMap((p) => [...p.transactions]))).toEqual(
      new Set(['contribution', 'fee', 'annual_statement']),
    );
    expect(types(PROPERTIES.flatMap((p) => [...p.transactions]))).toEqual(
      new Set(['valuation', 'rent_income', 'expense', 'repayment']),
    );
    expect(GOALS.map((goal): string => goal.type).sort()).toEqual(
      ['invest_habit', 'portfolio', 'salary', 'savings', 'savings'].sort(),
    );
  });

  test('includes a loss, negative equity and a pension statement that lost value', () => {
    const loss = HOLDINGS.filter((holding) => {
      const bought = holding.transactions.filter((t) => t.type === 'buy');
      const cost = bought.reduce((sum, t) => sum + (t.shares ?? 0) * t.price, 0);
      const shares = bought.reduce((sum, t) => sum + (t.shares ?? 0), 0);
      return holding.currentPrice < cost / shares;
    });
    expect(loss.length).toBeGreaterThan(0);
    const underwater = PROPERTIES.filter((p) => p.currentValue < expectedPropertyDebt(p));
    expect(underwater.map((p) => p.key)).toEqual(['flat']);
    const statements = PENSION_POTS.flatMap((p) => p.transactions).filter(
      (t) => t.type === 'annual_statement',
    );
    expect(statements.some((t) => t.amount < 0)).toBe(true);
  });

  test('contains non-ASCII text in names and notes', () => {
    const names = [
      ...SAVINGS_ACCOUNTS.flatMap((a) => [a.name, a.bank]),
      ...budgetTransactions().map((t) => t.merchant),
    ];
    // eslint-disable-next-line no-control-regex -- the point is to find characters outside ASCII.
    expect(names.filter((name) => /[^\x00-\x7F]/.test(name)).length).toBeGreaterThanOrEqual(3);
  });

  test('keeps every savings balance at or above zero as the ledger is applied', () => {
    for (const account of SAVINGS_ACCOUNTS) {
      let balance = toCents(account.openingBalance);
      const ordered = [...account.transactions].sort((a, b) => a.date.localeCompare(b.date));
      for (const transaction of ordered) {
        balance += (transaction.type === 'withdrawal' ? -1 : 1) * toCents(transaction.amount);
        expect(balance).toBeGreaterThanOrEqual(0);
      }
      expect(expectedSavingsBalance(account)).toBeGreaterThan(0);
    }
  });

  test('splits every repayment into interest and principal that add up', () => {
    const rows = [
      ...MORTGAGE.repayments,
      ...DEBTS.flatMap((d) => d.payments),
      ...PROPERTIES.flatMap((p) => p.transactions.filter((t) => t.type === 'repayment')),
    ];
    for (const row of rows) {
      const interest = 'interest' in row ? row.interest : 0;
      expect(interest).toBeGreaterThan(0);
      expect(interest).toBeLessThan(row.amount);
    }
    const [first] = amortise(100000, 3, 1000, ['2026-01-01']);
    expect(first).toEqual({ date: '2026-01-01', amount: 1000, interest: 250, principal: 750 });
  });

  test('never repays more principal than was owed', () => {
    expect(expectedMortgageBalance(MORTGAGE)).toBeGreaterThan(0);
    expect(expectedMortgageBalance(MORTGAGE)).toBeLessThan(MORTGAGE.openingBalance);
    expect(MORTGAGE.openingBalance).toBeLessThanOrEqual(MORTGAGE.originalAmount);
    for (const debt of DEBTS) {
      expect(expectedDebtBalance(debt)).toBeGreaterThan(0);
      expect(debt.openingBalance).toBeLessThanOrEqual(debt.originalAmount);
    }
    for (const property of PROPERTIES)
      expect(expectedPropertyDebt(property)).toBeGreaterThanOrEqual(0);
  });

  test('derives balances from the ledger the way the app does', () => {
    expect(expectedSavingsBalance(SAVINGS_ACCOUNTS[0]!)).toBe(7400);
    expect(expectedPensionBalance(PENSION_POTS[0]!)).toBe(51552.8);
    expect(expectedPensionBalance(PENSION_POTS[1]!)).toBe(22885.75);
    expect(expectedShares(HOLDINGS[0]!)).toBe(40);
    expect(expectedShares(HOLDINGS[2]!)).toBe(150);
  });

  test('budgets every spent category, in a month that exists, with a positive amount', () => {
    const transactions = budgetTransactions();
    expect(transactions.length).toBeGreaterThan(50);
    const months = new Set(BUDGET_MONTHS.map((m) => `${m.month}:${m.year}`));
    for (const transaction of transactions) {
      expect(months.has(`${transaction.month}:${transaction.year}`)).toBe(true);
      expect(transaction.amount).toBeGreaterThan(0);
      const category = BUDGET_CATEGORIES.find((c) => c.name === transaction.categoryName)!;
      const inMonth = budgetCategoryMonths(category).some(
        (m) => m.month === transaction.month && m.year === transaction.year,
      );
      expect(inMonth).toBe(true);
    }
  });

  test('is the same every time it is built', () => {
    expect(budgetTransactions()).toEqual(budgetTransactions());
    expect(amortise(284500, 3.45, 1428, ['2025-10-01', '2025-11-01'])).toEqual(
      amortise(284500, 3.45, 1428, ['2025-10-01', '2025-11-01']),
    );
  });

  test('carries no document, so the household needs no stored file', () => {
    const text = JSON.stringify([
      SAVINGS_ACCOUNTS,
      HOLDINGS,
      PROPERTIES,
      MORTGAGE,
      PENSION_POTS,
      DEBTS,
      EMPLOYMENTS,
      GOALS,
    ]);
    expect(text).not.toMatch(/document|\.pdf/i);
  });
});

describe('demo household rate history', () => {
  const base = buildSeedCurrencyRates(new Date('2026-10-09T12:00:00Z'));
  const history = buildSeedRateHistory(base);
  const currencies = new Set<string>([
    ...SAVINGS_ACCOUNTS.map((a) => a.currency),
    ...HOLDINGS.map((h) => h.currency),
    ...PROPERTIES.map((p) => p.currency),
    ...PENSION_POTS.map((p) => p.currency),
    ...DEBTS.map((d) => d.currency),
    ...EMPLOYMENTS.map((e) => e.currency),
    ...budgetTransactions().map((t) => t.currency),
  ]);

  test('has a rate on the first of every month, for every currency the seed holds a rate for', () => {
    const days = rateHistoryDays();
    expect(days[0]).toBe(RATE_HISTORY_FIRST_DAY);
    expect(days.at(-1)).toBe(RATE_HISTORY_LAST_DAY);
    expect(days).toHaveLength(22);
    expect(history).toHaveLength(days.length * base.length);
    for (const { fromCurrency } of base) {
      const own = history.filter((row) => row.fromCurrency === fromCurrency);
      expect(own.map((row) => row.sourceDate)).toEqual(days);
    }
  });

  test('covers the household date range for every currency it uses', () => {
    const earliest = datedRows()
      .map((row) => row.date)
      .sort()[0]!;
    expect(RATE_HISTORY_FIRST_DAY <= earliest).toBe(true);
    expect(RATE_HISTORY_LAST_DAY >= `${HOUSEHOLD_AS_OF.slice(0, 7)}-01`).toBe(true);
    for (const currency of currencies) {
      if (currency === 'EUR') continue;
      expect(history.some((row) => row.fromCurrency === currency)).toBe(true);
    }
  });

  test('is plausible: within one percent of the seeded rate, six decimals, to EUR', () => {
    for (const row of history) {
      const seeded = base.find((rate) => rate.fromCurrency === row.fromCurrency)!.rate;
      expect(Math.abs(row.rate / seeded - 1)).toBeLessThan(0.01);
      expect(hasAtMostDecimals(row.rate, MAX_SHARE_DECIMALS)).toBe(true);
      expect(row.toCurrency).toBe('EUR');
    }
  });

  test('is the same every time', () => {
    expect(buildSeedRateHistory(base)).toEqual(history);
    expect(buildSeedRateHistory(buildSeedCurrencyRates(new Date('2031-01-01T00:00:00Z')))).toEqual(
      history,
    );
  });

  test('confirms every bank of the household under a fictional scheme', () => {
    for (const account of SAVINGS_ACCOUNTS) {
      const protection = DEPOSIT_PROTECTION[account.bank];
      expect(protection).toBeDefined();
      expect(protection!.cap).toBeGreaterThan(0);
      expect(protection!.currency).toBe(account.currency);
    }
  });
});
