import {
  addMonthsUtc,
  monthEndUtc,
  monthStartUtc,
  toIsoDate,
  toUtcTimestamp,
  type PensionTransactionType,
} from '@quro/shared';
import { and, eq, getTableColumns, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import {
  debtPayments,
  debts,
  holdingPriceHistory,
  holdingTransactions,
  holdings,
  mortgages,
  netWorthSnapshots,
  pensionPots,
  pensionTransactions,
  propertyTransactions,
  properties,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import {
  buildRatesToBaseCurrencyAt,
  convertToBaseCurrency,
  FX_BASE_CURRENCY,
  type HistoricalCurrencyRateRow,
} from '../lib/currencyRateCache';
import {
  getCurrentRatesToBaseCurrency,
  getHistoricalCurrencyRateRows,
} from '../lib/currencyRateSync';
import {
  computeDerivedAllocations,
  resolveHistoricalHoldingPrice,
  type DerivedAllocationSummary,
} from '../lib/netWorth';
import { ownedOrJointPredicate } from '../lib/partner';
import { toNumberOrZero } from '../lib/numbers';
import { computePensionTransactionDelta } from '../lib/pensionTransactions';

const BASE_CURRENCY = FX_BASE_CURRENCY;
const NET_WORTH_HISTORY_MONTHS = 7;
// Joint assets count half for each partner so the two dashboards sum to reality.
const JOINT_WEIGHT = 0.5;

function toOptionalTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatMonthShort(monthStart: number): string {
  return new Date(monthStart).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function getRatesToBaseCurrency(): Promise<Map<string, number>> {
  return getCurrentRatesToBaseCurrency(BASE_CURRENCY);
}

const convertToBase = (amount: number, currency: string, rates: Map<string, number>) => {
  return convertToBaseCurrency(amount, currency, rates);
};

type Archivable = { archivedAt?: Date | string | null };

type SavingsAccountRow = { id: number; balance: unknown; currency: string };
type HistoricalSavingsAccountRow = SavingsAccountRow & Archivable;
type SavingsTransactionRow = { accountId: number; type: string; amount: unknown; date: string };
type HoldingRow = { id: number; currentPrice: unknown; currency: string } & Archivable;
type HoldingTransactionRow = {
  holdingId: number;
  type: string;
  shares: unknown;
  price: unknown;
  date: string;
};
type PropertyRow = {
  id: number;
  purchasePrice: unknown;
  currentValue: unknown;
  mortgage: unknown;
  mortgageId: number | null;
  currency: string;
} & Archivable;
type PropertyTransactionRow = {
  propertyId: number;
  type: string;
  amount: unknown;
  interest: unknown;
  principal: unknown;
  date: string;
};
type PensionPotRow = { id: number; balance: unknown; currency: string } & Archivable;
type PensionTransactionRow = {
  potId: number;
  type: string;
  amount: unknown;
  taxAmount: unknown;
  date: string;
};
type MortgageRow = { id: number; outstandingBalance: unknown } & Archivable;
type DebtRow = { id: number; remainingBalance: unknown; currency: string } & Archivable;
type DebtPaymentRow = {
  debtId: number;
  amount: unknown;
  principal: unknown;
  interest: unknown;
  date: string;
  note?: string | null;
};

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
  price: number;
  timestamp: number;
};

type HoldingPriceRow = {
  holdingId: number;
  eodDate: string;
  closePrice: unknown;
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
  type: PensionTransactionType;
  amount: number;
  taxAmount: number;
  timestamp: number;
};

type DatedDebtPayment = {
  debtId: number;
  amount: number;
  principal: number;
  interest: number;
  timestamp: number;
};

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

// ── Joint-asset weighting ────────────────────────────────────────────────────
// All net-worth/allocation formulas are linear in an asset's monetary fields,
// so pre-scaling joint rows (and their transactions) by JOINT_WEIGHT halves
// their contribution exactly without touching the compute functions.

function buildJointIdSet(rows: ReadonlyArray<{ id: number; isJoint: boolean }>): Set<number> {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.isJoint) ids.add(row.id);
  }
  return ids;
}

function weighJointSavingsAccounts(
  rows: ReadonlyArray<typeof savingsAccounts.$inferSelect>,
): HistoricalSavingsAccountRow[] {
  return rows.map((row) =>
    row.isJoint ? { ...row, balance: toNumberOrZero(row.balance) * JOINT_WEIGHT } : row,
  );
}

function weighJointSavingsTransactions(
  rows: ReadonlyArray<typeof savingsTransactions.$inferSelect>,
  jointAccountIds: ReadonlySet<number>,
): SavingsTransactionRow[] {
  return rows.map((row) =>
    jointAccountIds.has(row.accountId)
      ? { ...row, amount: toNumberOrZero(row.amount) * JOINT_WEIGHT }
      : row,
  );
}

function weighJointProperties(
  rows: ReadonlyArray<typeof properties.$inferSelect>,
): Array<PropertyRow & { isJoint: boolean }> {
  return rows.map((row) =>
    row.isJoint
      ? {
          ...row,
          purchasePrice: toNumberOrZero(row.purchasePrice) * JOINT_WEIGHT,
          currentValue: toNumberOrZero(row.currentValue) * JOINT_WEIGHT,
          mortgage: toNumberOrZero(row.mortgage) * JOINT_WEIGHT,
        }
      : row,
  );
}

function weighJointPropertyTransactions(
  rows: ReadonlyArray<typeof propertyTransactions.$inferSelect>,
  jointPropertyIds: ReadonlySet<number>,
): PropertyTransactionRow[] {
  return rows.map((row) =>
    jointPropertyIds.has(row.propertyId)
      ? {
          ...row,
          amount: toNumberOrZero(row.amount) * JOINT_WEIGHT,
          interest: row.interest == null ? null : toNumberOrZero(row.interest) * JOINT_WEIGHT,
          principal: row.principal == null ? null : toNumberOrZero(row.principal) * JOINT_WEIGHT,
        }
      : row,
  );
}

function weighJointMortgages(
  rows: ReadonlyArray<typeof mortgages.$inferSelect>,
): Array<MortgageRow & { isJoint: boolean }> {
  return rows.map((row) =>
    row.isJoint
      ? { ...row, outstandingBalance: toNumberOrZero(row.outstandingBalance) * JOINT_WEIGHT }
      : row,
  );
}

type JointScopedSourceRows = {
  savings: Array<typeof savingsAccounts.$inferSelect>;
  savingsTransactions: Array<typeof savingsTransactions.$inferSelect>;
  properties: Array<typeof properties.$inferSelect>;
  propertyTransactions: Array<typeof propertyTransactions.$inferSelect>;
  mortgages: Array<typeof mortgages.$inferSelect>;
};

async function loadJointScopedRows(
  userId: number,
  partnerId: number | null,
): Promise<JointScopedSourceRows> {
  const savingsAccess = ownedOrJointPredicate(savingsAccounts, userId, partnerId);
  const propertyAccess = ownedOrJointPredicate(properties, userId, partnerId);
  const mortgageAccess = ownedOrJointPredicate(mortgages, userId, partnerId);

  const [savings, savingsTxns, propertyRows, propertyTxns, mortgageRows] = await Promise.all([
    safeLoad('savings accounts', db.select().from(savingsAccounts).where(savingsAccess), []),
    safeLoad(
      'savings transactions',
      db
        .select(getTableColumns(savingsTransactions))
        .from(savingsTransactions)
        .innerJoin(savingsAccounts, eq(savingsTransactions.accountId, savingsAccounts.id))
        .where(savingsAccess),
      [],
    ),
    safeLoad('properties', db.select().from(properties).where(propertyAccess), []),
    safeLoad(
      'property transactions',
      db
        .select(getTableColumns(propertyTransactions))
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .where(propertyAccess),
      [],
    ),
    safeLoad('mortgages', db.select().from(mortgages).where(mortgageAccess), []),
  ]);

  return {
    savings,
    savingsTransactions: savingsTxns,
    properties: propertyRows,
    propertyTransactions: propertyTxns,
    mortgages: mortgageRows,
  };
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
      amount: toNumberOrZero(transaction.amount),
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
      shares: toNumberOrZero(transaction.shares),
      price: toNumberOrZero(transaction.price),
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
      amount: toNumberOrZero(transaction.amount),
      interest: transaction.interest == null ? null : toNumberOrZero(transaction.interest),
      principal: transaction.principal == null ? null : toNumberOrZero(transaction.principal),
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
        transaction.type === 'annual_statement',
    )
    .map((transaction) => ({
      potId: transaction.potId,
      type: transaction.type as DatedPensionTransaction['type'],
      amount: toNumberOrZero(transaction.amount),
      taxAmount: toNumberOrZero(transaction.taxAmount),
      timestamp: toUtcTimestamp(transaction.date),
    }))
    .filter((transaction) => Number.isFinite(transaction.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
}

function buildDatedDebtPayments(payments: readonly DebtPaymentRow[]): DatedDebtPayment[] {
  return payments
    .map((payment) => ({
      debtId: payment.debtId,
      amount: toNumberOrZero(payment.amount),
      principal: toNumberOrZero(payment.principal),
      interest: toNumberOrZero(payment.interest),
      timestamp: toUtcTimestamp(payment.date),
    }))
    .filter((payment) => Number.isFinite(payment.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
}

function computeDebtLiabilitiesAtCutoff(
  debts: readonly DebtRow[],
  paymentsByDebtId: ReadonlyMap<number, readonly DatedDebtPayment[]>,
  cutoff: number,
  rates: Map<string, number>,
): number {
  return debts.reduce((sum, debt) => {
    if (isArchivedAtCutoff(debt, cutoff)) return sum;
    let balance = toNumberOrZero(debt.remainingBalance);
    for (const payment of paymentsByDebtId.get(debt.id) ?? []) {
      if (payment.timestamp <= cutoff) continue;
      balance += payment.principal;
    }
    return sum + convertToBase(Math.max(0, balance), debt.currency, rates);
  }, 0);
}

export async function buildDerivedAllocations(
  userId: number,
  partnerId: number | null,
): Promise<DerivedAllocationSummary> {
  const [rates, jointScoped, userHoldings, userHoldingTxns, userPensions, userDebts] =
    await Promise.all([
      getRatesToBaseCurrency(),
      loadJointScopedRows(userId, partnerId),
      db
        .select()
        .from(holdings)
        .where(and(eq(holdings.userId, userId), isNull(holdings.archivedAt))),
      db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
      db
        .select()
        .from(pensionPots)
        .where(and(eq(pensionPots.userId, userId), isNull(pensionPots.archivedAt))),
      db
        .select()
        .from(debts)
        .where(and(eq(debts.userId, userId), isNull(debts.archivedAt))),
    ]);
  return computeDerivedAllocations(
    rates,
    weighJointSavingsAccounts(jointScoped.savings.filter((row) => !row.archivedAt)),
    userHoldings,
    userHoldingTxns,
    weighJointProperties(jointScoped.properties.filter((row) => !row.archivedAt)),
    userPensions,
    weighJointMortgages(jointScoped.mortgages.filter((row) => !row.archivedAt)),
    userDebts,
  );
}

function buildRollingMonths() {
  const now = Date.now();
  const currentMonth = monthStartUtc(now);
  const firstMonth = addMonthsUtc(currentMonth, -(NET_WORTH_HISTORY_MONTHS - 1));
  const months: Array<{
    cutoff: number;
    asOfDate: string;
    snapshotDate: string;
    isCurrent: boolean;
    label: string;
    year: number;
  }> = [];

  for (let month = firstMonth; month <= currentMonth; month = addMonthsUtc(month, 1)) {
    const cutoff = month === currentMonth ? now : monthEndUtc(month);
    months.push({
      cutoff,
      asOfDate: toIsoDate(new Date(cutoff)),
      snapshotDate: toIsoDate(new Date(monthEndUtc(month))),
      isCurrent: month === currentMonth,
      label: formatMonthShort(month),
      year: new Date(month).getUTCFullYear(),
    });
  }

  return months;
}

function computeSavingsAtCutoff(
  accounts: readonly HistoricalSavingsAccountRow[],
  txnsByAccountId: ReadonlyMap<number, readonly DatedSavingsTransaction[]>,
  cutoff: number,
  rates: Map<string, number>,
): number {
  return accounts.reduce((sum, account) => {
    if (isArchivedAtCutoff(account, cutoff)) return sum;

    let balance = toNumberOrZero(account.balance);
    for (const transaction of txnsByAccountId.get(account.id) ?? []) {
      if (transaction.timestamp <= cutoff) continue;
      if (transaction.type === 'withdrawal') balance += transaction.amount;
      else balance -= transaction.amount;
    }
    return sum + convertToBase(Math.max(0, balance), account.currency, rates);
  }, 0);
}

function isArchivedAtCutoff(entity: Archivable, cutoff: number): boolean {
  const archivedAt = toOptionalTimestamp(entity.archivedAt);
  return archivedAt !== null && archivedAt <= cutoff;
}

function computePensionAtCutoff(
  pots: readonly PensionPotRow[],
  txnsByPotId: ReadonlyMap<number, readonly DatedPensionTransaction[]>,
  cutoff: number,
  rates: Map<string, number>,
): number {
  return pots.reduce((sum, pot) => {
    if (isArchivedAtCutoff(pot, cutoff)) return sum;
    let balance = toNumberOrZero(pot.balance);
    for (const transaction of txnsByPotId.get(pot.id) ?? []) {
      if (transaction.timestamp <= cutoff) continue;
      balance -= computePensionTransactionDelta(transaction);
    }
    return sum + convertToBase(Math.max(0, balance), pot.currency, rates);
  }, 0);
}

function computeBrokerageAtCutoff(
  portfolioHoldings: readonly HoldingRow[],
  txnsByHoldingId: ReadonlyMap<number, readonly DatedHoldingTransaction[]>,
  pricesByHoldingId: ReadonlyMap<number, readonly HoldingPriceRow[]>,
  cutoff: number,
  cutoffDate: string,
  rates: Map<string, number>,
): { value: number; isEstimated: boolean } {
  const totals = portfolioHoldings.map((holding) =>
    computeHoldingAtCutoff(
      holding,
      txnsByHoldingId.get(holding.id) ?? [],
      pricesByHoldingId.get(holding.id) ?? [],
      cutoff,
      cutoffDate,
      rates,
    ),
  );
  return {
    value: totals.reduce((sum, holding) => sum + holding.value, 0),
    isEstimated: totals.some((holding) => holding.isEstimated),
  };
}

function computeHoldingAtCutoff(
  holding: HoldingRow,
  transactions: readonly DatedHoldingTransaction[],
  prices: readonly HoldingPriceRow[],
  cutoff: number,
  cutoffDate: string,
  rates: Map<string, number>,
): { value: number; isEstimated: boolean } {
  if (isArchivedAtCutoff(holding, cutoff)) return { value: 0, isEstimated: false };
  let shares = 0;
  let latestTransactionPrice: number | null = null;
  for (const transaction of transactions) {
    if (transaction.timestamp > cutoff) break;
    shares += transaction.type === 'buy' ? transaction.shares : -transaction.shares;
    latestTransactionPrice = transaction.price;
  }
  const historicalPrice = resolveHistoricalHoldingPrice(prices, cutoffDate);
  const price = historicalPrice ?? latestTransactionPrice ?? toNumberOrZero(holding.currentPrice);
  return {
    value: convertToBase(Math.max(0, shares) * price, holding.currency, rates),
    isEstimated: historicalPrice === null && shares > 0,
  };
}

function buildActiveMortgageBalanceAtCutoff(
  userMortgages: readonly MortgageRow[],
  cutoff: number,
): Map<number, number> {
  const balances = new Map<number, number>();
  for (const mortgage of userMortgages) {
    if (isArchivedAtCutoff(mortgage, cutoff)) continue;
    balances.set(mortgage.id, toNumberOrZero(mortgage.outstandingBalance));
  }
  return balances;
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
      ? toNumberOrZero(property.purchasePrice)
      : toNumberOrZero(property.currentValue);

    for (const transaction of transactions) {
      if (transaction.timestamp > cutoff) break;
      if (transaction.type === 'valuation') propertyValue = transaction.amount;
    }
    return propertyValue;
  }

  function resolveBaseMortgageBalance(property: PropertyRow): number {
    // Linked mortgages are the source of truth; an archived one (absent from
    // the active set at this cutoff) leaves the property unencumbered.
    if (property.mortgageId == null) return toNumberOrZero(property.mortgage);
    return mortgageBalanceById.get(property.mortgageId) ?? 0;
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
    if (isArchivedAtCutoff(property, cutoff)) return sum;
    const transactions = txnsByPropertyId.get(property.id) ?? [];
    const propertyValue = resolvePropertyValueAtCutoff(property, transactions);
    const mortgageBalance = resolveMortgageBalanceAtCutoff(property, transactions);
    const equity = propertyValue - mortgageBalance;
    return sum + convertToBase(equity, property.currency, rates);
  }, 0);
}

type NetWorthSourceData = {
  rates: Map<string, number>;
  historicalRates: HistoricalCurrencyRateRow[];
  savings: HistoricalSavingsAccountRow[];
  savingsTransactions: SavingsTransactionRow[];
  holdings: HoldingRow[];
  holdingTransactions: HoldingTransactionRow[];
  holdingPrices: HoldingPriceRow[];
  properties: PropertyRow[];
  propertyTransactions: PropertyTransactionRow[];
  pensions: PensionPotRow[];
  pensionTransactions: PensionTransactionRow[];
  mortgages: MortgageRow[];
  debts: DebtRow[];
  debtPayments: DebtPaymentRow[];
  snapshots: Array<typeof netWorthSnapshots.$inferSelect>;
};

type NetWorthHistoryPoint = {
  id: number;
  month: string;
  year: number;
  totalValue: number;
  currency: string;
  isEstimated: boolean;
};

async function safeLoad<T>(label: string, query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await query;
  } catch (error) {
    console.warn(`[Dashboard] Failed to load ${label}`, error);
    return fallback;
  }
}

export async function loadNetWorthSourceData(
  userId: number,
  partnerId: number | null,
): Promise<NetWorthSourceData> {
  const [
    rates,
    historicalRates,
    jointScoped,
    holdingsData,
    holdingTransactionsData,
    holdingPricesData,
    pensions,
    pensionTransactionsData,
    debtsData,
    debtPaymentsData,
    snapshots,
  ] = await Promise.all([
    getRatesToBaseCurrency(),
    getHistoricalCurrencyRateRows(),
    loadJointScopedRows(userId, partnerId),
    safeLoad('holdings', db.select().from(holdings).where(eq(holdings.userId, userId)), []),
    safeLoad(
      'holding transactions',
      db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
      [],
    ),
    safeLoad(
      'holding price history',
      db.select().from(holdingPriceHistory).where(eq(holdingPriceHistory.userId, userId)),
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
    safeLoad('debts', db.select().from(debts).where(eq(debts.userId, userId)), []),
    safeLoad(
      'debt payments',
      db.select().from(debtPayments).where(eq(debtPayments.userId, userId)),
      [],
    ),
    safeLoad(
      'net worth snapshots',
      db.select().from(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId)),
      [],
    ),
  ]);

  return {
    rates,
    historicalRates,
    savings: weighJointSavingsAccounts(jointScoped.savings),
    savingsTransactions: weighJointSavingsTransactions(
      jointScoped.savingsTransactions,
      buildJointIdSet(jointScoped.savings),
    ),
    holdings: holdingsData,
    holdingTransactions: holdingTransactionsData,
    holdingPrices: holdingPricesData,
    properties: weighJointProperties(jointScoped.properties),
    propertyTransactions: weighJointPropertyTransactions(
      jointScoped.propertyTransactions,
      buildJointIdSet(jointScoped.properties),
    ),
    pensions,
    pensionTransactions: pensionTransactionsData,
    mortgages: weighJointMortgages(jointScoped.mortgages),
    debts: debtsData,
    debtPayments: debtPaymentsData,
    snapshots,
  };
}

function buildFallbackNetWorthHistory(sourceData: NetWorthSourceData): NetWorthHistoryPoint[] {
  const dropArchived = <T extends Archivable>(rows: readonly T[]): T[] =>
    rows.filter((row) => !row.archivedAt);
  const allocationSummary = computeDerivedAllocations(
    sourceData.rates,
    dropArchived(sourceData.savings),
    dropArchived(sourceData.holdings),
    sourceData.holdingTransactions,
    sourceData.properties,
    dropArchived(sourceData.pensions),
    dropArchived(sourceData.mortgages),
    dropArchived(sourceData.debts),
  );
  const currentMonth = monthStartUtc(Date.now());
  const totalValue =
    allocationSummary.allocations.reduce((sum, item) => sum + item.value, 0) -
    allocationSummary.liabilitiesTotal;

  return [
    {
      id: 1,
      month: formatMonthShort(currentMonth),
      year: new Date(currentMonth).getUTCFullYear(),
      totalValue,
      currency: BASE_CURRENCY,
      isEstimated: false,
    },
  ];
}

export function buildNetWorthHistory(sourceData: NetWorthSourceData): NetWorthHistoryPoint[] {
  const context = buildNetWorthHistoryContext(sourceData);
  if (!hasNetWorthHistory(context, sourceData.snapshots)) {
    return buildFallbackNetWorthHistory(sourceData);
  }
  return buildRollingMonths().map((month, index) =>
    buildNetWorthHistoryPoint(sourceData, context, month, index),
  );
}

type NetWorthHistoryContext = {
  savingsByAccount: Map<number, DatedSavingsTransaction[]>;
  holdingsById: Map<number, DatedHoldingTransaction[]>;
  holdingPricesById: Map<number, HoldingPriceRow[]>;
  propertiesById: Map<number, DatedPropertyTransaction[]>;
  pensionsByPotId: Map<number, DatedPensionTransaction[]>;
  debtPaymentsByDebtId: Map<number, DatedDebtPayment[]>;
  snapshotByDate: Map<string, NetWorthSourceData['snapshots'][number]>;
};

function buildNetWorthHistoryContext(sourceData: NetWorthSourceData): NetWorthHistoryContext {
  const datedSavingsTransactions = buildDatedSavingsTransactions(sourceData.savingsTransactions);
  const datedHoldingTransactions = buildDatedHoldingTransactions(sourceData.holdingTransactions);
  const datedPropertyTransactions = buildDatedPropertyTransactions(sourceData.propertyTransactions);
  const datedPensionTransactions = buildDatedPensionTransactions(sourceData.pensionTransactions);
  const datedDebtPayments = buildDatedDebtPayments(sourceData.debtPayments);
  return {
    savingsByAccount: groupByNumericId(datedSavingsTransactions, (item) => item.accountId),
    holdingsById: groupByNumericId(datedHoldingTransactions, (item) => item.holdingId),
    holdingPricesById: groupByNumericId(sourceData.holdingPrices ?? [], (item) => item.holdingId),
    propertiesById: groupByNumericId(datedPropertyTransactions, (item) => item.propertyId),
    pensionsByPotId: groupByNumericId(datedPensionTransactions, (item) => item.potId),
    debtPaymentsByDebtId: groupByNumericId(datedDebtPayments, (item) => item.debtId),
    snapshotByDate: new Map(
      (sourceData.snapshots ?? []).map((snapshot) => [snapshot.snapshotDate, snapshot]),
    ),
  };
}

function hasNetWorthHistory(
  context: NetWorthHistoryContext,
  snapshots: NetWorthSourceData['snapshots'],
): boolean {
  const transactionCounts = [
    context.savingsByAccount.size,
    context.holdingsById.size,
    context.propertiesById.size,
    context.pensionsByPotId.size,
    context.debtPaymentsByDebtId.size,
  ];
  return transactionCounts.some((count) => count > 0) || snapshots.length > 0;
}

function buildNetWorthHistoryPoint(
  sourceData: NetWorthSourceData,
  context: NetWorthHistoryContext,
  month: ReturnType<typeof buildRollingMonths>[number],
  index: number,
): NetWorthHistoryPoint {
  // Current-month snapshots can predate a price sync or direct holding edit.
  // Rebuild that point from source data; completed months remain immutable snapshots.
  const snapshot = month.isCurrent ? undefined : context.snapshotByDate.get(month.snapshotDate);
  if (snapshot) {
    return {
      id: index + 1,
      month: month.label,
      year: month.year,
      totalValue: toNumberOrZero(snapshot.totalValue),
      currency: snapshot.baseCurrency,
      isEstimated: snapshot.isEstimated,
    };
  }
  const historicalRates = sourceData.historicalRates?.length
    ? buildRatesToBaseCurrencyAt(sourceData.historicalRates, month.asOfDate)
    : { rates: sourceData.rates, isEstimated: true };
  const savings = computeSavingsAtCutoff(
    sourceData.savings,
    context.savingsByAccount,
    month.cutoff,
    historicalRates.rates,
  );
  const brokerage = computeBrokerageAtCutoff(
    sourceData.holdings,
    context.holdingsById,
    context.holdingPricesById,
    month.cutoff,
    month.asOfDate,
    historicalRates.rates,
  );
  const propertyEquity = computePropertyEquityAtCutoff(
    sourceData.properties,
    context.propertiesById,
    buildActiveMortgageBalanceAtCutoff(sourceData.mortgages, month.cutoff),
    month.cutoff,
    historicalRates.rates,
  );
  const pension = computePensionAtCutoff(
    sourceData.pensions,
    context.pensionsByPotId,
    month.cutoff,
    historicalRates.rates,
  );
  const liabilities = computeDebtLiabilitiesAtCutoff(
    sourceData.debts,
    context.debtPaymentsByDebtId,
    month.cutoff,
    historicalRates.rates,
  );
  return {
    id: index + 1,
    month: month.label,
    year: month.year,
    totalValue: savings + brokerage.value + propertyEquity + pension - liabilities,
    currency: BASE_CURRENCY,
    isEstimated: historicalRates.isEstimated || brokerage.isEstimated,
  };
}
