import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import {
  budgetTransactions,
  currencyRates,
  holdingTransactions,
  holdings,
  mortgageTransactions,
  mortgages,
  payslips,
  pensionPots,
  pensionTransactions,
  propertyTransactions,
  properties,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { getAuthUser } from '../lib/authUser';

const app = new Hono();
const BASE_CURRENCY = 'EUR';
const NET_WORTH_HISTORY_MONTHS = 7;

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

function toUtcTimestamp(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function monthStartUtc(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function monthEndUtc(monthStart: number): number {
  const date = new Date(monthStart); // eslint-disable-next-line no-magic-numbers
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonthsUtc(monthStart: number, delta: number): number {
  const date = new Date(monthStart);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1);
}

function formatMonthShort(monthStart: number): string {
  return new Date(monthStart).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

async function getRatesToBaseCurrency() {
  const rows = await db
    .select({ fromCurrency: currencyRates.fromCurrency, rate: currencyRates.rate })
    .from(currencyRates)
    .where(eq(currencyRates.toCurrency, BASE_CURRENCY));

  const rates = new Map<string, number>();
  for (const row of rows) {
    rates.set(row.fromCurrency, toNumber(row.rate));
  }
  rates.set(BASE_CURRENCY, 1);
  return rates;
}

const convertToBase = (amount: number, currency: string, rates: Map<string, number>) => {
  const rate = rates.get(currency) ?? 1;
  return amount * rate;
};

type DerivedAllocation = {
  id: number;
  name: string;
  value: number;
  color: string;
  currency: string;
};

function computeSharesByHolding(
  txns: Array<{ holdingId: number; shares: unknown; type: string }>,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const txn of txns) {
    const existing = map.get(txn.holdingId) ?? 0;
    const shares = toNumber(txn.shares);
    if (txn.type === 'buy') map.set(txn.holdingId, existing + shares);
    else if (txn.type === 'sell') map.set(txn.holdingId, existing - shares);
  }
  return map;
}

type SavingsAccountRow = { id: number; balance: unknown; currency: string };
type SavingsTransactionRow = { accountId: number; type: string; amount: unknown; date: string };
type HoldingRow = { id: number; currentPrice: unknown; currency: string };
type HoldingTransactionRow = { holdingId: number; type: string; shares: unknown; date: string };
type PropertyRow = {
  id: number;
  purchasePrice: unknown;
  currentValue: unknown;
  mortgage: unknown;
  mortgageId: number | null;
  currency: string;
};
type PropertyTransactionRow = {
  propertyId: number;
  type: string;
  amount: unknown;
  interest: unknown;
  principal: unknown;
  date: string;
};
type PensionPotRow = { id: number; balance: unknown; currency: string };
type PensionTransactionRow = {
  potId: number;
  type: string;
  amount: unknown;
  taxAmount: unknown;
  date: string;
};
type MortgageRow = { id: number; outstandingBalance: unknown };

type CurrencyRow = { id: number; currency: string };

type DatedSavingsTransaction = {
  accountId: number;
  type: 'deposit' | 'withdrawal' | 'interest';
  amount: number;
  timestamp: number;
};

type DatedHoldingTransaction = {
  holdingId: number;
  type: 'buy' | 'sell';
  shares: number;
  timestamp: number;
};

type DatedPropertyTransaction = {
  propertyId: number;
  type: 'valuation' | 'repayment';
  amount: number;
  interest: number | null;
  principal: number | null;
  timestamp: number;
};

type DatedPensionTransaction = {
  potId: number;
  type: 'contribution' | 'fee' | 'annual_statement' | 'tax';
  amount: number;
  taxAmount: number;
  timestamp: number;
};

function computePensionTxnDelta(transaction: {
  type: string;
  amount: number;
  taxAmount: number;
}): number {
  if (transaction.type === 'contribution') return transaction.amount - transaction.taxAmount;
  if (transaction.type === 'fee' || transaction.type === 'tax') return -transaction.amount;
  if (transaction.type === 'annual_statement') return transaction.amount;
  return 0;
}

function groupByNumericId<T>(rows: readonly T[], getId: (row: T) => number): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const id = getId(row);
    const bucket = grouped.get(id);
    if (bucket) bucket.push(row);
    else grouped.set(id, [row]);
  }
  return grouped;
}

function buildCurrencyById(rows: readonly CurrencyRow[]): Map<number, string> {
  const currencies = new Map<number, string>();
  for (const row of rows) {
    currencies.set(row.id, row.currency);
  }
  return currencies;
}

function resolveCurrency(
  currencyById: ReadonlyMap<number, string>,
  id: number,
  fallback = BASE_CURRENCY,
): string {
  return currencyById.get(id) ?? fallback;
}

function buildDatedSavingsTransactions(
  transactions: readonly SavingsTransactionRow[],
): DatedSavingsTransaction[] {
  return transactions
    .filter(
      (transaction) =>
        transaction.type === 'deposit' ||
        transaction.type === 'withdrawal' ||
        transaction.type === 'interest',
    )
    .map((transaction) => ({
      accountId: transaction.accountId,
      type: transaction.type as DatedSavingsTransaction['type'],
      amount: toNumber(transaction.amount),
      timestamp: toUtcTimestamp(transaction.date),
    }))
    .filter((transaction) => Number.isFinite(transaction.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
}

function buildDatedHoldingTransactions(
  transactions: readonly HoldingTransactionRow[],
): DatedHoldingTransaction[] {
  return transactions
    .filter((transaction) => transaction.type === 'buy' || transaction.type === 'sell')
    .map((transaction) => ({
      holdingId: transaction.holdingId,
      type: transaction.type as DatedHoldingTransaction['type'],
      shares: toNumber(transaction.shares),
      timestamp: toUtcTimestamp(transaction.date),
    }))
    .filter((transaction) => Number.isFinite(transaction.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
}

function buildDatedPropertyTransactions(
  transactions: readonly PropertyTransactionRow[],
): DatedPropertyTransaction[] {
  return transactions
    .filter((transaction) => transaction.type === 'valuation' || transaction.type === 'repayment')
    .map((transaction) => ({
      propertyId: transaction.propertyId,
      type: transaction.type as DatedPropertyTransaction['type'],
      amount: toNumber(transaction.amount),
      interest: transaction.interest == null ? null : toNumber(transaction.interest),
      principal: transaction.principal == null ? null : toNumber(transaction.principal),
      timestamp: toUtcTimestamp(transaction.date),
    }))
    .filter((transaction) => Number.isFinite(transaction.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
}

function buildDatedPensionTransactions(
  transactions: readonly PensionTransactionRow[],
): DatedPensionTransaction[] {
  return transactions
    .filter(
      (transaction) =>
        transaction.type === 'contribution' ||
        transaction.type === 'fee' ||
        transaction.type === 'annual_statement' ||
        transaction.type === 'tax',
    )
    .map((transaction) => ({
      potId: transaction.potId,
      type: transaction.type as DatedPensionTransaction['type'],
      amount: toNumber(transaction.amount),
      taxAmount: toNumber(transaction.taxAmount),
      timestamp: toUtcTimestamp(transaction.date),
    }))
    .filter((transaction) => Number.isFinite(transaction.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
}

function buildMortgageBalanceById(mortgages: readonly MortgageRow[]): Map<number, number> {
  const balances = new Map<number, number>();
  for (const mortgage of mortgages) {
    balances.set(mortgage.id, toNumber(mortgage.outstandingBalance));
  }
  return balances;
}

function computeDerivedAllocations(
  rates: Map<string, number>,
  userSavings: readonly SavingsAccountRow[],
  userHoldings: readonly HoldingRow[],
  userHoldingTxns: readonly HoldingTransactionRow[],
  userProperties: readonly PropertyRow[],
  userPensions: readonly PensionPotRow[],
  userMortgages: readonly MortgageRow[],
): DerivedAllocation[] {
  const savingsTotal = userSavings.reduce(
    (sum, account) => sum + convertToBase(toNumber(account.balance), account.currency, rates),
    0,
  );

  const sharesByHolding = computeSharesByHolding([...userHoldingTxns]);
  const brokerageTotal = userHoldings.reduce((sum, holding) => {
    const shares = Math.max(0, sharesByHolding.get(holding.id) ?? 0);
    return sum + convertToBase(shares * toNumber(holding.currentPrice), holding.currency, rates);
  }, 0);

  const mortgageBalanceById = buildMortgageBalanceById(userMortgages);
  const propertyEquityTotal = userProperties.reduce((sum, property) => {
    const linkedBalance = property.mortgageId
      ? mortgageBalanceById.get(property.mortgageId)
      : undefined;
    const equity = toNumber(property.currentValue) - (linkedBalance ?? toNumber(property.mortgage));
    return sum + convertToBase(equity, property.currency, rates);
  }, 0);

  const pensionTotal = userPensions.reduce(
    (sum, pot) => sum + convertToBase(toNumber(pot.balance), pot.currency, rates),
    0,
  );

  return [
    { id: 1, name: 'Savings', value: savingsTotal, color: '#6366f1', currency: BASE_CURRENCY },
    {
      id: 2,
      name: 'Brokerage',
      value: brokerageTotal,
      color: '#0ea5e9',
      currency: BASE_CURRENCY,
    },
    {
      id: 3,
      name: 'Property Equity',
      value: propertyEquityTotal,
      color: '#10b981',
      currency: BASE_CURRENCY,
    },
    { id: 4, name: 'Pension', value: pensionTotal, color: '#f59e0b', currency: BASE_CURRENCY },
  ];
}

async function buildDerivedAllocations(userId: number): Promise<DerivedAllocation[]> {
  const [
    rates,
    userSavings,
    userHoldings,
    userHoldingTxns,
    userProperties,
    userPensions,
    userMortgages,
  ] = await Promise.all([
    getRatesToBaseCurrency(),
    db.select().from(savingsAccounts).where(eq(savingsAccounts.userId, userId)),
    db.select().from(holdings).where(eq(holdings.userId, userId)),
    db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
    db.select().from(properties).where(eq(properties.userId, userId)),
    db.select().from(pensionPots).where(eq(pensionPots.userId, userId)),
    db.select().from(mortgages).where(eq(mortgages.userId, userId)),
  ]);
  return computeDerivedAllocations(
    rates,
    userSavings,
    userHoldings,
    userHoldingTxns,
    userProperties,
    userPensions,
    userMortgages,
  );
}

function buildRollingMonths() {
  const now = Date.now();
  const currentMonth = monthStartUtc(now);
  const firstMonth = addMonthsUtc(currentMonth, -(NET_WORTH_HISTORY_MONTHS - 1));
  const months: Array<{
    cutoff: number;
    label: string;
    year: number;
  }> = [];

  for (let month = firstMonth; month <= currentMonth; month = addMonthsUtc(month, 1)) {
    months.push({
      cutoff: month === currentMonth ? now : monthEndUtc(month),
      label: formatMonthShort(month),
      year: new Date(month).getUTCFullYear(),
    });
  }

  return months;
}

function computeSavingsAtCutoff(
  accounts: readonly SavingsAccountRow[],
  txnsByAccountId: ReadonlyMap<number, readonly DatedSavingsTransaction[]>,
  cutoff: number,
  rates: Map<string, number>,
): number {
  return accounts.reduce((sum, account) => {
    let balance = toNumber(account.balance);
    for (const transaction of txnsByAccountId.get(account.id) ?? []) {
      if (transaction.timestamp <= cutoff) continue;
      if (transaction.type === 'withdrawal') balance += transaction.amount;
      else balance -= transaction.amount;
    }
    return sum + convertToBase(Math.max(0, balance), account.currency, rates);
  }, 0);
}

function computePensionAtCutoff(
  pots: readonly PensionPotRow[],
  txnsByPotId: ReadonlyMap<number, readonly DatedPensionTransaction[]>,
  cutoff: number,
  rates: Map<string, number>,
): number {
  return pots.reduce((sum, pot) => {
    let balance = toNumber(pot.balance);
    for (const transaction of txnsByPotId.get(pot.id) ?? []) {
      if (transaction.timestamp <= cutoff) continue;
      balance -= computePensionTxnDelta(transaction);
    }
    return sum + convertToBase(Math.max(0, balance), pot.currency, rates);
  }, 0);
}

function computeBrokerageAtCutoff(
  portfolioHoldings: readonly HoldingRow[],
  txnsByHoldingId: ReadonlyMap<number, readonly DatedHoldingTransaction[]>,
  cutoff: number,
  rates: Map<string, number>,
): number {
  return portfolioHoldings.reduce((sum, holding) => {
    let shares = 0;
    for (const transaction of txnsByHoldingId.get(holding.id) ?? []) {
      if (transaction.timestamp > cutoff) break;
      if (transaction.type === 'buy') shares += transaction.shares;
      else shares -= transaction.shares;
    }
    const value = Math.max(0, shares) * toNumber(holding.currentPrice);
    return sum + convertToBase(value, holding.currency, rates);
  }, 0);
}

function computePropertyEquityAtCutoff(
  userProperties: readonly PropertyRow[],
  txnsByPropertyId: ReadonlyMap<number, readonly DatedPropertyTransaction[]>,
  mortgageBalanceById: ReadonlyMap<number, number>,
  cutoff: number,
  rates: Map<string, number>,
): number {
  function resolvePropertyValueAtCutoff(
    property: PropertyRow,
    transactions: readonly DatedPropertyTransaction[],
  ): number {
    const hasValuationTransaction = transactions.some(
      (transaction) => transaction.type === 'valuation',
    );
    let propertyValue = hasValuationTransaction
      ? toNumber(property.purchasePrice)
      : toNumber(property.currentValue);

    for (const transaction of transactions) {
      if (transaction.timestamp > cutoff) break;
      if (transaction.type === 'valuation') propertyValue = transaction.amount;
    }
    return propertyValue;
  }

  function resolveBaseMortgageBalance(property: PropertyRow): number {
    if (property.mortgageId == null) return toNumber(property.mortgage);
    return mortgageBalanceById.get(property.mortgageId) ?? toNumber(property.mortgage);
  }

  function resolveMortgageBalanceAtCutoff(
    property: PropertyRow,
    transactions: readonly DatedPropertyTransaction[],
  ): number {
    let mortgageBalance = resolveBaseMortgageBalance(property);
    for (const transaction of transactions) {
      if (transaction.timestamp <= cutoff || transaction.type !== 'repayment') continue;
      const principal =
        transaction.principal ?? Math.max(0, transaction.amount - (transaction.interest ?? 0));
      mortgageBalance += principal;
    }
    return mortgageBalance;
  }

  return userProperties.reduce((sum, property) => {
    const transactions = txnsByPropertyId.get(property.id) ?? [];
    const propertyValue = resolvePropertyValueAtCutoff(property, transactions);
    const mortgageBalance = resolveMortgageBalanceAtCutoff(property, transactions);
    const equity = propertyValue - mortgageBalance;
    return sum + convertToBase(equity, property.currency, rates);
  }, 0);
}

type NetWorthSourceData = {
  rates: Map<string, number>;
  savings: SavingsAccountRow[];
  savingsTransactions: SavingsTransactionRow[];
  holdings: HoldingRow[];
  holdingTransactions: HoldingTransactionRow[];
  properties: PropertyRow[];
  propertyTransactions: PropertyTransactionRow[];
  pensions: PensionPotRow[];
  pensionTransactions: PensionTransactionRow[];
  mortgages: MortgageRow[];
};

type NetWorthHistoryPoint = {
  id: number;
  month: string;
  year: number;
  totalValue: number;
  currency: string;
};

async function safeLoad<T>(label: string, query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await query;
  } catch (error) {
    console.warn(`[Dashboard] Failed to load ${label}`, error);
    return fallback;
  }
}

async function loadNetWorthSourceData(userId: number): Promise<NetWorthSourceData> {
  const rates = await safeLoad(
    'currency rates',
    getRatesToBaseCurrency(),
    new Map([[BASE_CURRENCY, 1]]),
  );
  const [
    savings,
    savingsTransactionsData,
    holdingsData,
    holdingTransactionsData,
    propertiesData,
    propertyTransactionsData,
    pensions,
    pensionTransactionsData,
    mortgagesData,
  ] = await Promise.all([
    safeLoad(
      'savings accounts',
      db.select().from(savingsAccounts).where(eq(savingsAccounts.userId, userId)),
      [],
    ),
    safeLoad(
      'savings transactions',
      db.select().from(savingsTransactions).where(eq(savingsTransactions.userId, userId)),
      [],
    ),
    safeLoad('holdings', db.select().from(holdings).where(eq(holdings.userId, userId)), []),
    safeLoad(
      'holding transactions',
      db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
      [],
    ),
    safeLoad('properties', db.select().from(properties).where(eq(properties.userId, userId)), []),
    safeLoad(
      'property transactions',
      db.select().from(propertyTransactions).where(eq(propertyTransactions.userId, userId)),
      [],
    ),
    safeLoad(
      'pension pots',
      db.select().from(pensionPots).where(eq(pensionPots.userId, userId)),
      [],
    ),
    safeLoad(
      'pension transactions',
      db.select().from(pensionTransactions).where(eq(pensionTransactions.userId, userId)),
      [],
    ),
    safeLoad('mortgages', db.select().from(mortgages).where(eq(mortgages.userId, userId)), []),
  ]);

  return {
    rates,
    savings,
    savingsTransactions: savingsTransactionsData,
    holdings: holdingsData,
    holdingTransactions: holdingTransactionsData,
    properties: propertiesData,
    propertyTransactions: propertyTransactionsData,
    pensions,
    pensionTransactions: pensionTransactionsData,
    mortgages: mortgagesData,
  };
}

function buildFallbackNetWorthHistory(sourceData: NetWorthSourceData): NetWorthHistoryPoint[] {
  const allocations = computeDerivedAllocations(
    sourceData.rates,
    sourceData.savings,
    sourceData.holdings,
    sourceData.holdingTransactions,
    sourceData.properties,
    sourceData.pensions,
    sourceData.mortgages,
  );
  const currentMonth = monthStartUtc(Date.now());
  const totalValue = allocations.reduce((sum, item) => sum + item.value, 0);

  return [
    {
      id: 1,
      month: formatMonthShort(currentMonth),
      year: new Date(currentMonth).getUTCFullYear(),
      totalValue,
      currency: BASE_CURRENCY,
    },
  ];
}

function buildNetWorthHistory(sourceData: NetWorthSourceData): NetWorthHistoryPoint[] {
  const datedSavingsTransactions = buildDatedSavingsTransactions(sourceData.savingsTransactions);
  const datedHoldingTransactions = buildDatedHoldingTransactions(sourceData.holdingTransactions);
  const datedPropertyTransactions = buildDatedPropertyTransactions(sourceData.propertyTransactions);
  const datedPensionTransactions = buildDatedPensionTransactions(sourceData.pensionTransactions);

  const hasQualifyingTransactions =
    datedSavingsTransactions.length > 0 ||
    datedHoldingTransactions.length > 0 ||
    datedPropertyTransactions.length > 0 ||
    datedPensionTransactions.length > 0;
  if (!hasQualifyingTransactions) return buildFallbackNetWorthHistory(sourceData);

  const months = buildRollingMonths();
  const savingsByAccount = groupByNumericId(
    datedSavingsTransactions,
    (transaction) => transaction.accountId,
  );
  const holdingsById = groupByNumericId(
    datedHoldingTransactions,
    (transaction) => transaction.holdingId,
  );
  const propertiesById = groupByNumericId(
    datedPropertyTransactions,
    (transaction) => transaction.propertyId,
  );
  const pensionsByPotId = groupByNumericId(
    datedPensionTransactions,
    (transaction) => transaction.potId,
  );
  const mortgageBalanceById = buildMortgageBalanceById(sourceData.mortgages);

  return months.map((month, index) => {
    const savings = computeSavingsAtCutoff(
      sourceData.savings,
      savingsByAccount,
      month.cutoff,
      sourceData.rates,
    );
    const brokerage = computeBrokerageAtCutoff(
      sourceData.holdings,
      holdingsById,
      month.cutoff,
      sourceData.rates,
    );
    const propertyEquity = computePropertyEquityAtCutoff(
      sourceData.properties,
      propertiesById,
      mortgageBalanceById,
      month.cutoff,
      sourceData.rates,
    );
    const pension = computePensionAtCutoff(
      sourceData.pensions,
      pensionsByPotId,
      month.cutoff,
      sourceData.rates,
    );

    return {
      id: index + 1,
      month: month.label,
      year: month.year,
      totalValue: savings + brokerage + propertyEquity + pension,
      currency: BASE_CURRENCY,
    };
  });
}

app.get('/net-worth', async (c) => {
  const user = getAuthUser(c);
  const sourceData = await loadNetWorthSourceData(user.id);
  return c.json({ data: buildNetWorthHistory(sourceData) });
});

app.get('/allocations', async (c) => {
  const user = getAuthUser(c);
  const data = await buildDerivedAllocations(user.id);
  return c.json({ data });
});

type ActivityRow = { note?: string | null; type: string; amount: unknown; date: string };

type PayslipActivityRow = {
  month: string;
  net: unknown;
  bonus: unknown;
  date: string;
  currency: string;
};

type BudgetActivityRow = {
  description: string;
  amount: unknown;
  date: string;
};

type SavingsActivityRow = ActivityRow & { accountId: number };

type HoldingActivityRow = {
  note?: string | null;
  type: string;
  date: string;
  holdingId: number;
  shares: unknown;
  price: unknown;
};

type MortgageActivityRow = ActivityRow & { mortgageId: number };

type PensionActivityRow = ActivityRow & { potId: number; taxAmount: unknown };

type PropertyActivityRow = ActivityRow & { propertyId: number };

function mapSavingsTxn(row: SavingsActivityRow, currencyByAccountId: ReadonlyMap<number, string>) {
  const currency = resolveCurrency(currencyByAccountId, row.accountId);
  if (row.type === 'interest') {
    return {
      name: row.note || 'Savings interest',
      type: 'income' as const,
      amount: Math.abs(toNumber(row.amount)),
      date: row.date,
      category: 'Savings',
      currency,
    };
  }
  const isDeposit = row.type === 'deposit';
  return {
    name: row.note || (isDeposit ? 'Savings deposit' : 'Savings withdrawal'),
    type: 'transfer' as const,
    amount: isDeposit ? -Math.abs(toNumber(row.amount)) : Math.abs(toNumber(row.amount)),
    date: row.date,
    category: 'Savings',
    currency,
  };
}

function mapHoldingTxn(row: HoldingActivityRow, currencyByHoldingId: ReadonlyMap<number, string>) {
  const currency = resolveCurrency(currencyByHoldingId, row.holdingId);
  if (row.type === 'dividend') {
    return {
      name: row.note || 'Dividend',
      type: 'income' as const,
      amount: Math.abs(toNumber(row.price)),
      date: row.date,
      category: 'Investment',
      currency,
    };
  }
  const gross = toNumber(row.shares) * toNumber(row.price);
  const isBuy = row.type === 'buy';
  return {
    name: row.note || (isBuy ? 'Investment buy' : 'Investment sell'),
    type: 'transfer' as const,
    amount: isBuy ? -Math.abs(gross) : Math.abs(gross),
    date: row.date,
    category: 'Investment',
    currency,
  };
}

function mapPropertyTxn(
  row: PropertyActivityRow,
  currencyByPropertyId: ReadonlyMap<number, string>,
) {
  const currency = resolveCurrency(currencyByPropertyId, row.propertyId);
  const isIncome = row.type === 'rent_income';
  return {
    name: row.note || (isIncome ? 'Rent income' : 'Property expense'),
    type: isIncome ? ('income' as const) : ('expense' as const),
    amount: isIncome ? Math.abs(toNumber(row.amount)) : -Math.abs(toNumber(row.amount)),
    date: row.date,
    category: 'Property',
    currency,
  };
}

function mapPayslipActivity(row: PayslipActivityRow) {
  return {
    name: `Salary ${row.month}`,
    type: 'income' as const,
    amount: toNumber(row.net) + toNumber(row.bonus),
    date: row.date,
    category: 'Salary',
    currency: row.currency,
  };
}

function mapBudgetActivity(row: BudgetActivityRow) {
  return {
    name: row.description,
    type: 'expense' as const,
    amount: -Math.abs(toNumber(row.amount)),
    date: row.date,
    category: 'Budget',
    currency: BASE_CURRENCY,
  };
}

function mapMortgageTxn(
  row: MortgageActivityRow,
  mortgageCurrencyById: ReadonlyMap<number, string>,
) {
  return {
    name: row.note || 'Mortgage repayment',
    type: 'expense' as const,
    amount: -Math.abs(toNumber(row.amount)),
    date: row.date,
    category: 'Mortgage',
    currency: resolveCurrency(mortgageCurrencyById, row.mortgageId),
  };
}

function mapPensionTxn(
  row: PensionActivityRow,
  pensionCurrencyByPotId: ReadonlyMap<number, string>,
) {
  const amount = toNumber(row.amount);
  const taxAmount = toNumber(row.taxAmount);
  const currency = resolveCurrency(pensionCurrencyByPotId, row.potId);

  if (row.type === 'contribution') {
    const netAmount = amount - taxAmount;
    return {
      name: row.note || 'Pension contribution',
      type: 'transfer' as const,
      amount: -Math.abs(netAmount),
      date: row.date,
      category: 'Pension',
      currency,
    };
  }

  if (row.type === 'annual_statement') {
    const isGain = amount >= 0;
    return {
      name:
        row.note || (isGain ? 'Pension annual statement gain' : 'Pension annual statement loss'),
      type: isGain ? ('income' as const) : ('expense' as const),
      amount: isGain ? Math.abs(amount) : -Math.abs(amount),
      date: row.date,
      category: 'Pension',
      currency,
    };
  }

  return {
    name: row.note || 'Pension fee',
    type: 'expense' as const,
    amount: -Math.abs(amount),
    date: row.date,
    category: 'Pension',
    currency,
  };
}

function buildActivityList(
  payslipRows: readonly PayslipActivityRow[],
  budgetRows: readonly BudgetActivityRow[],
  savingsRows: readonly SavingsActivityRow[],
  holdingRows: readonly HoldingActivityRow[],
  mortgageRows: readonly MortgageActivityRow[],
  pensionRows: readonly PensionActivityRow[],
  propertyRows: readonly PropertyActivityRow[],
  savingsCurrencyByAccountId: ReadonlyMap<number, string>,
  holdingCurrencyById: ReadonlyMap<number, string>,
  mortgageCurrencyById: ReadonlyMap<number, string>,
  pensionCurrencyByPotId: ReadonlyMap<number, string>,
  propertyCurrencyById: ReadonlyMap<number, string>,
) {
  return [
    ...payslipRows.map(mapPayslipActivity),
    ...budgetRows.map(mapBudgetActivity),
    ...savingsRows.map((row) => mapSavingsTxn(row, savingsCurrencyByAccountId)),
    ...holdingRows.map((row) => mapHoldingTxn(row, holdingCurrencyById)),
    ...mortgageRows
      .filter((row) => row.type === 'repayment')
      .map((row) => mapMortgageTxn(row, mortgageCurrencyById)),
    ...pensionRows.map((row) => mapPensionTxn(row, pensionCurrencyByPotId)),
    ...propertyRows
      .filter((row) => row.type === 'rent_income' || row.type === 'expense')
      .map((row) => mapPropertyTxn(row, propertyCurrencyById)),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((row, index) => ({ id: index + 1, ...row }));
}

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const [p, b, s, sa, h, ho, m, mo, pe, po, pr, ps] = await Promise.all([
    db.select().from(payslips).where(eq(payslips.userId, user.id)),
    db.select().from(budgetTransactions).where(eq(budgetTransactions.userId, user.id)),
    db.select().from(savingsTransactions).where(eq(savingsTransactions.userId, user.id)),
    db
      .select({ id: savingsAccounts.id, currency: savingsAccounts.currency })
      .from(savingsAccounts)
      .where(eq(savingsAccounts.userId, user.id)),
    db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, user.id)),
    db
      .select({ id: holdings.id, currency: holdings.currency })
      .from(holdings)
      .where(eq(holdings.userId, user.id)),
    db.select().from(mortgageTransactions).where(eq(mortgageTransactions.userId, user.id)),
    db
      .select({ id: mortgages.id, currency: mortgages.currency })
      .from(mortgages)
      .where(eq(mortgages.userId, user.id)),
    db.select().from(pensionTransactions).where(eq(pensionTransactions.userId, user.id)),
    db
      .select({ id: pensionPots.id, currency: pensionPots.currency })
      .from(pensionPots)
      .where(eq(pensionPots.userId, user.id)),
    db.select().from(propertyTransactions).where(eq(propertyTransactions.userId, user.id)),
    db
      .select({ id: properties.id, currency: properties.currency })
      .from(properties)
      .where(eq(properties.userId, user.id)),
  ]);
  return c.json({
    data: buildActivityList(
      p,
      b,
      s,
      h,
      m,
      pe,
      pr,
      buildCurrencyById(sa),
      buildCurrencyById(ho),
      buildCurrencyById(mo),
      buildCurrencyById(po),
      buildCurrencyById(ps),
    ),
  });
});

export default app;
