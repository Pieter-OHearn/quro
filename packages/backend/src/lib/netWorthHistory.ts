import { getPropertyDebt } from './propertyDebt';
import {
  addMonthsUtc,
  DEFAULT_NET_WORTH_RANGE,
  holdingValue,
  monthEndUtc,
  monthStartUtc,
  netHoldingShares,
  pensionTransactionDelta,
  signedSavingsAmount,
  sumMoney,
  toIsoDate,
  toUtcTimestamp,
  type NetWorthRange,
  type PensionTransactionType,
} from '@quro/shared';
import { and, desc, eq, getTableColumns, gte, lt, min, sql, type SQL } from 'drizzle-orm';
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
  createHistoricalRateResolver,
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
  resolvePreparedHoldingPrice,
  loadSnapshotInputs,
  type DerivedAllocationSummary,
} from '../lib/netWorth';
import { ownedOrJointPredicate, loadHouseholdRows, scopeHouseholdRows } from '../lib/partner';
import { toNumberOrZero } from '../lib/numbers';

const BASE_CURRENCY = FX_BASE_CURRENCY;
// Month-end points before the current month for the monthly ranges.
const RANGE_MONTHS = { '6m': 6, '1y': 12 } as const;
// Daily points before today for `1m`.
const RANGE_DAYS = 30;
/** `all` starts at the first dated record, but never more than this many months back. */
export const NET_WORTH_ALL_MAX_MONTHS = 360;
const DAY_MS = 86_400_000;

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

type JointScopedSourceRows = {
  savings: Array<typeof savingsAccounts.$inferSelect>;
  savingsTransactions: Array<typeof savingsTransactions.$inferSelect>;
  properties: Array<typeof properties.$inferSelect>;
  propertyTransactions: Array<typeof propertyTransactions.$inferSelect>;
  mortgages: Array<typeof mortgages.$inferSelect>;
};

// Retain a boundary row so old-only ledgers still produce the same points as the full ledger.
function loadSavingsHistory(access: SQL | undefined, start: string) {
  const columns = getTableColumns(savingsTransactions);
  const query = () =>
    db
      .select(columns)
      .from(savingsTransactions)
      .innerJoin(savingsAccounts, eq(savingsTransactions.accountId, savingsAccounts.id));
  const before = db
    .selectDistinctOn([savingsTransactions.accountId], columns)
    .from(savingsTransactions)
    .innerJoin(savingsAccounts, eq(savingsTransactions.accountId, savingsAccounts.id))
    .where(and(access, lt(savingsTransactions.date, start)))
    .orderBy(
      savingsTransactions.accountId,
      desc(savingsTransactions.date),
      desc(savingsTransactions.id),
    );
  return query()
    .where(and(access, gte(savingsTransactions.date, start)))
    .unionAll(before);
}

function loadPropertyHistory(access: SQL | undefined, start: string) {
  const columns = getTableColumns(propertyTransactions);
  const before = db
    .selectDistinctOn([propertyTransactions.propertyId], columns)
    .from(propertyTransactions)
    .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
    .where(
      and(access, lt(propertyTransactions.date, start), eq(propertyTransactions.type, 'valuation')),
    )
    .orderBy(
      propertyTransactions.propertyId,
      desc(propertyTransactions.date),
      desc(propertyTransactions.id),
    );
  // A second boundary row preserves history presence for repayment-only ledgers.
  const boundary = db
    .selectDistinctOn([propertyTransactions.propertyId], columns)
    .from(propertyTransactions)
    .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
    .where(and(access, lt(propertyTransactions.date, start)))
    .orderBy(
      propertyTransactions.propertyId,
      desc(propertyTransactions.date),
      desc(propertyTransactions.id),
    );
  return db
    .select(columns)
    .from(propertyTransactions)
    .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
    .where(and(access, gte(propertyTransactions.date, start)))
    .union(before)
    .union(boundary);
}

function loadHoldingHistory(userId: number, start: string) {
  const columns = {
    holdingId: holdingTransactions.holdingId,
    type: holdingTransactions.type,
    shares: holdingTransactions.shares,
    price: holdingTransactions.price,
    date: holdingTransactions.date,
  };
  const latest = db
    .selectDistinctOn([holdingTransactions.holdingId], columns)
    .from(holdingTransactions)
    .where(
      and(
        eq(holdingTransactions.userId, userId),
        lt(holdingTransactions.date, start),
        sql`${holdingTransactions.type} in ('buy', 'sell')`,
      ),
    )
    .orderBy(
      holdingTransactions.holdingId,
      desc(holdingTransactions.date),
      desc(holdingTransactions.id),
    )
    .as('latest');
  // Shares require the entire opening position, not just the last transaction. Net shares do not
  // depend on order, so one row stands in for the rows before the window: a buy of the net, or a
  // sell of it when more was sold than bought.
  const openingNet = sql`sum(case when ${holdingTransactions.type} = 'buy' then ${holdingTransactions.shares} else -${holdingTransactions.shares} end)`;
  const opening = db
    .select({
      holdingId: holdingTransactions.holdingId,
      type: sql<string>`case when ${openingNet} < 0 then 'sell' else 'buy' end`,
      shares: sql<number>`abs(${openingNet})`.mapWith(Number),
      price: latest.price,
      date: latest.date,
    })
    .from(holdingTransactions)
    .innerJoin(latest, eq(latest.holdingId, holdingTransactions.holdingId))
    .where(
      and(
        eq(holdingTransactions.userId, userId),
        lt(holdingTransactions.date, start),
        sql`${holdingTransactions.type} in ('buy', 'sell')`,
      ),
    )
    .groupBy(holdingTransactions.holdingId, latest.price, latest.date);
  return db
    .select(columns)
    .from(holdingTransactions)
    .where(and(eq(holdingTransactions.userId, userId), gte(holdingTransactions.date, start)))
    .unionAll(opening);
}

function loadHoldingPrices(userId: number, start: string) {
  const columns = getTableColumns(holdingPriceHistory);
  const before = db
    .selectDistinctOn([holdingPriceHistory.holdingId], columns)
    .from(holdingPriceHistory)
    .where(and(eq(holdingPriceHistory.userId, userId), lt(holdingPriceHistory.eodDate, start)))
    .orderBy(holdingPriceHistory.holdingId, desc(holdingPriceHistory.eodDate));
  return db
    .select(columns)
    .from(holdingPriceHistory)
    .where(and(eq(holdingPriceHistory.userId, userId), gte(holdingPriceHistory.eodDate, start)))
    .unionAll(before);
}

function loadPensionHistory(userId: number, start: string) {
  const columns = getTableColumns(pensionTransactions);
  const before = db
    .selectDistinctOn([pensionTransactions.potId], columns)
    .from(pensionTransactions)
    .where(and(eq(pensionTransactions.userId, userId), lt(pensionTransactions.date, start)))
    .orderBy(
      pensionTransactions.potId,
      desc(pensionTransactions.date),
      desc(pensionTransactions.id),
    );
  return db
    .select(columns)
    .from(pensionTransactions)
    .where(and(eq(pensionTransactions.userId, userId), gte(pensionTransactions.date, start)))
    .unionAll(before);
}

function loadDebtHistory(userId: number, start: string) {
  const columns = getTableColumns(debtPayments);
  const before = db
    .selectDistinctOn([debtPayments.debtId], columns)
    .from(debtPayments)
    .where(and(eq(debtPayments.userId, userId), lt(debtPayments.date, start)))
    .orderBy(debtPayments.debtId, desc(debtPayments.date), desc(debtPayments.id));
  return db
    .select(columns)
    .from(debtPayments)
    .where(and(eq(debtPayments.userId, userId), gte(debtPayments.date, start)))
    .unionAll(before);
}

async function loadJointScopedRows(
  userId: number,
  partnerId: number | null,
  windowStart: string,
): Promise<JointScopedSourceRows> {
  const savingsAccess = ownedOrJointPredicate(savingsAccounts, userId, partnerId);
  const propertyAccess = ownedOrJointPredicate(properties, userId, partnerId);

  const [savings, savingsTxns, propertyRows, propertyTxns, mortgageRows] = await Promise.all([
    loadHouseholdRows(savingsAccounts, userId, partnerId, { includeArchived: true }),
    loadSavingsHistory(savingsAccess, windowStart),
    loadHouseholdRows(properties, userId, partnerId, { includeArchived: true }),
    loadPropertyHistory(propertyAccess, windowStart),
    loadHouseholdRows(mortgages, userId, partnerId, { includeArchived: true }),
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
  return sumMoney(
    debts.map((debt) => {
      if (isArchivedAtCutoff(debt, cutoff)) return 0;
      let balance = toNumberOrZero(debt.remainingBalance);
      for (const payment of paymentsByDebtId.get(debt.id) ?? []) {
        if (payment.timestamp <= cutoff) continue;
        balance += payment.principal;
      }
      return convertToBase(Math.max(0, balance), debt.currency, rates);
    }),
  );
}

export async function buildDerivedAllocations(
  userId: number,
  partnerId: number | null,
): Promise<DerivedAllocationSummary> {
  const input = await loadSnapshotInputs(userId, { partnerId });
  return computeDerivedAllocations(
    input.rates,
    input.savings,
    input.holdings,
    input.holdingTransactions,
    input.properties,
    input.pensions,
    input.mortgages,
    input.debts,
  );
}

export function buildAllocationsFromSource(source: NetWorthSourceData): DerivedAllocationSummary {
  const active = <T extends Archivable>(rows: readonly T[]) =>
    rows.filter((row) => !row.archivedAt);
  return computeDerivedAllocations(
    source.rates,
    active(source.savings),
    active(source.holdings),
    source.holdingTransactions,
    active(source.properties),
    active(source.pensions),
    active(source.mortgages),
    active(source.debts),
  );
}

/** One point of the history: everything dated after `cutoff` is replayed out of the balances. */
export type HistoryPeriod = {
  cutoff: number;
  asOfDate: string;
  /** The month end whose stored snapshot can stand in for the point; null for daily points. */
  snapshotDate: string | null;
  isCurrent: boolean;
  label: string;
  year: number;
};

function buildMonthlyPeriods(firstMonth: number, now: number): HistoryPeriod[] {
  const currentMonth = monthStartUtc(now);
  const periods: HistoryPeriod[] = [];
  for (let month = firstMonth; month <= currentMonth; month = addMonthsUtc(month, 1)) {
    const cutoff = month === currentMonth ? now : monthEndUtc(month);
    periods.push({
      cutoff,
      asOfDate: toIsoDate(new Date(cutoff)),
      snapshotDate: toIsoDate(new Date(monthEndUtc(month))),
      isCurrent: month === currentMonth,
      label: formatMonthShort(month),
      year: new Date(month).getUTCFullYear(),
    });
  }
  return periods;
}

// Snapshots are month-end figures, so daily points are always rebuilt from the ledgers and the
// stored rate and price history, as the current month's point is.
function buildDailyPeriods(now: number): HistoryPeriod[] {
  const today = toUtcTimestamp(toIsoDate(new Date(now)));
  const periods: HistoryPeriod[] = [];
  for (let offset = RANGE_DAYS; offset >= 0; offset -= 1) {
    const day = today - offset * DAY_MS;
    periods.push({
      cutoff: offset === 0 ? now : day + DAY_MS - 1,
      asOfDate: toIsoDate(new Date(day)),
      snapshotDate: null,
      isCurrent: offset === 0,
      label: formatMonthShort(day),
      year: new Date(day).getUTCFullYear(),
    });
  }
  return periods;
}

/**
 * The points of a range, oldest first, ending with the current moment. `firstRecordDate` is
 * the household's first dated record and only moves the start of `all`.
 */
export function buildHistoryPeriods(
  range: NetWorthRange = DEFAULT_NET_WORTH_RANGE,
  now = Date.now(),
  firstRecordDate: string | null = null,
): HistoryPeriod[] {
  const currentMonth = monthStartUtc(now);
  if (range === '1m') return buildDailyPeriods(now);
  if (range !== 'all') {
    return buildMonthlyPeriods(addMonthsUtc(currentMonth, -RANGE_MONTHS[range]), now);
  }
  const earliest = addMonthsUtc(currentMonth, -NET_WORTH_ALL_MAX_MONTHS);
  const firstRecord = firstRecordDate === null ? Number.NaN : toUtcTimestamp(firstRecordDate);
  const firstMonth = Number.isFinite(firstRecord) ? monthStartUtc(firstRecord) : currentMonth;
  return buildMonthlyPeriods(Math.min(currentMonth, Math.max(earliest, firstMonth)), now);
}

function computeSavingsAtCutoff(
  accounts: readonly HistoricalSavingsAccountRow[],
  txnsByAccountId: ReadonlyMap<number, readonly DatedSavingsTransaction[]>,
  cutoff: number,
  rates: Map<string, number>,
): number {
  return sumMoney(
    accounts.map((account) => {
      if (isArchivedAtCutoff(account, cutoff)) return 0;
      let balance = toNumberOrZero(account.balance);
      for (const transaction of txnsByAccountId.get(account.id) ?? []) {
        if (transaction.timestamp <= cutoff) continue;
        balance -= signedSavingsAmount(transaction.type, transaction.amount);
      }
      return convertToBase(Math.max(0, balance), account.currency, rates);
    }),
  );
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
  return sumMoney(
    pots.map((pot) => {
      if (isArchivedAtCutoff(pot, cutoff)) return 0;
      let balance = toNumberOrZero(pot.balance);
      for (const transaction of txnsByPotId.get(pot.id) ?? []) {
        if (transaction.timestamp <= cutoff) continue;
        balance -= pensionTransactionDelta(transaction);
      }
      return convertToBase(Math.max(0, balance), pot.currency, rates);
    }),
  );
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
    value: sumMoney(totals.map((holding) => holding.value)),
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
  const upToCutoff = transactions.filter((transaction) => transaction.timestamp <= cutoff);
  const shares = netHoldingShares(upToCutoff);
  const latestTransactionPrice = upToCutoff[upToCutoff.length - 1]?.price ?? null;
  const historicalPrice = resolvePreparedHoldingPrice(prices, cutoffDate);
  const price = historicalPrice ?? latestTransactionPrice ?? toNumberOrZero(holding.currentPrice);
  return {
    value: convertToBase(holdingValue(shares, price), holding.currency, rates),
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

  function resolveMortgageBalanceAtCutoff(
    property: PropertyRow,
    transactions: readonly DatedPropertyTransaction[],
  ): number {
    let mortgageBalance = getPropertyDebt(property, mortgageBalanceById);
    for (const transaction of transactions) {
      if (transaction.timestamp <= cutoff || transaction.type !== 'repayment') continue;
      const principal =
        transaction.principal ?? Math.max(0, transaction.amount - (transaction.interest ?? 0));
      mortgageBalance += principal;
    }
    return mortgageBalance;
  }

  return sumMoney(
    userProperties.map((property) => {
      if (isArchivedAtCutoff(property, cutoff)) return 0;
      const transactions = txnsByPropertyId.get(property.id) ?? [];
      const propertyValue = resolvePropertyValueAtCutoff(property, transactions);
      const mortgageBalance = resolveMortgageBalanceAtCutoff(property, transactions);
      return convertToBase(propertyValue - mortgageBalance, property.currency, rates);
    }),
  );
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
  /** The points to build; the default range when absent. */
  periods?: HistoryPeriod[];
};

type NetWorthHistoryPoint = {
  id: number;
  month: string;
  year: number;
  date: string;
  totalValue: number;
  currency: string;
  isEstimated: boolean;
};

/**
 * The household's first dated record: the earliest row of the ledgers the history replays (the
 * caller's own and the partner's joint savings and property rows, the caller's holding, pension
 * and debt rows) or of the caller's stored snapshots. Null when there is none.
 */
async function loadFirstRecordDate(userId: number, partnerId: number | null) {
  const rows = await db
    .select({ first: min(savingsTransactions.date) })
    .from(savingsTransactions)
    .innerJoin(savingsAccounts, eq(savingsTransactions.accountId, savingsAccounts.id))
    .where(ownedOrJointPredicate(savingsAccounts, userId, partnerId))
    .unionAll(
      db
        .select({ first: min(propertyTransactions.date) })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .where(ownedOrJointPredicate(properties, userId, partnerId)),
    )
    .unionAll(
      db
        .select({ first: min(holdingTransactions.date) })
        .from(holdingTransactions)
        .where(eq(holdingTransactions.userId, userId)),
    )
    .unionAll(
      db
        .select({ first: min(pensionTransactions.date) })
        .from(pensionTransactions)
        .where(eq(pensionTransactions.userId, userId)),
    )
    .unionAll(
      db
        .select({ first: min(debtPayments.date) })
        .from(debtPayments)
        .where(eq(debtPayments.userId, userId)),
    )
    .unionAll(
      db
        .select({ first: min(netWorthSnapshots.snapshotDate) })
        .from(netWorthSnapshots)
        .where(eq(netWorthSnapshots.userId, userId)),
    );
  const dates = rows.map((row) => row.first).filter((date): date is string => date !== null);
  return dates.length > 0 ? dates.reduce((left, right) => (right < left ? right : left)) : null;
}

export async function loadNetWorthSourceData(
  userId: number,
  partnerId: number | null,
  range: NetWorthRange = DEFAULT_NET_WORTH_RANGE,
): Promise<NetWorthSourceData> {
  const now = Date.now();
  const firstRecordDate = range === 'all' ? await loadFirstRecordDate(userId, partnerId) : null;
  const periods = buildHistoryPeriods(range, now, firstRecordDate);
  const firstPeriod = periods[0];
  // A failed read fails the request: a total never silently leaves out a whole asset class.
  const snapshots = await db
    .select()
    .from(netWorthSnapshots)
    .where(
      and(
        eq(netWorthSnapshots.userId, userId),
        gte(netWorthSnapshots.snapshotDate, firstPeriod.snapshotDate ?? firstPeriod.asOfDate),
      ),
    );
  const snapshotDates = new Set(snapshots.map((row) => row.snapshotDate));
  const firstMissing = periods.find(
    (period) =>
      period.isCurrent || period.snapshotDate === null || !snapshotDates.has(period.snapshotDate),
  )!;
  const windowStart = firstMissing.asOfDate;
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
  ] = await Promise.all([
    getRatesToBaseCurrency(),
    getHistoricalCurrencyRateRows(windowStart),
    loadJointScopedRows(userId, partnerId, windowStart),
    db.select().from(holdings).where(eq(holdings.userId, userId)),
    loadHoldingHistory(userId, windowStart),
    loadHoldingPrices(userId, windowStart),
    db.select().from(pensionPots).where(eq(pensionPots.userId, userId)),
    loadPensionHistory(userId, windowStart),
    db.select().from(debts).where(eq(debts.userId, userId)),
    loadDebtHistory(userId, windowStart),
  ]);

  return {
    rates,
    historicalRates,
    savings: scopeHouseholdRows('savings', jointScoped.savings, (row) => row.isJoint),
    savingsTransactions: scopeHouseholdRows(
      'savingsTransactions',
      jointScoped.savingsTransactions,
      (row) => jointScoped.savings.some((parent) => parent.id === row.accountId && parent.isJoint),
    ),
    holdings: holdingsData,
    holdingTransactions: holdingTransactionsData,
    holdingPrices: holdingPricesData,
    properties: scopeHouseholdRows('properties', jointScoped.properties, (row) => row.isJoint),
    propertyTransactions: scopeHouseholdRows(
      'propertyTransactions',
      jointScoped.propertyTransactions,
      (row) =>
        jointScoped.properties.some((parent) => parent.id === row.propertyId && parent.isJoint),
    ),
    pensions,
    pensionTransactions: pensionTransactionsData,
    mortgages: scopeHouseholdRows('mortgages', jointScoped.mortgages, (row) => row.isJoint),
    debts: debtsData,
    debtPayments: debtPaymentsData,
    snapshots,
    periods,
  };
}

function buildFallbackNetWorthHistory(
  sourceData: NetWorthSourceData,
  current: HistoryPeriod,
): NetWorthHistoryPoint[] {
  const dropArchived = <T extends Archivable>(rows: readonly T[]): T[] =>
    rows.filter((row) => !row.archivedAt);
  const allocationSummary = computeDerivedAllocations(
    sourceData.rates,
    dropArchived(sourceData.savings),
    dropArchived(sourceData.holdings),
    sourceData.holdingTransactions,
    dropArchived(sourceData.properties),
    dropArchived(sourceData.pensions),
    dropArchived(sourceData.mortgages),
    dropArchived(sourceData.debts),
  );
  return [
    {
      id: 1,
      month: current.label,
      year: current.year,
      date: current.asOfDate,
      totalValue: allocationSummary.netWorth,
      currency: BASE_CURRENCY,
      isEstimated: false,
    },
  ];
}

export function buildNetWorthHistory(sourceData: NetWorthSourceData): NetWorthHistoryPoint[] {
  const periods = sourceData.periods ?? buildHistoryPeriods();
  const context = buildNetWorthHistoryContext(sourceData);
  if (!hasNetWorthHistory(context, sourceData.snapshots)) {
    return buildFallbackNetWorthHistory(sourceData, periods[periods.length - 1]);
  }
  return periods.map((period, index) =>
    buildNetWorthHistoryPoint(sourceData, context, period, index),
  );
}

type NetWorthHistoryContext = {
  savingsByAccount: Map<number, DatedSavingsTransaction[]>;
  holdingsById: Map<number, DatedHoldingTransaction[]>;
  holdingPricesById: Map<number, HoldingPriceRow[]>;
  propertiesById: Map<number, DatedPropertyTransaction[]>;
  pensionsByPotId: Map<number, DatedPensionTransaction[]>;
  debtPaymentsByDebtId: Map<number, DatedDebtPayment[]>;
  ratesAt: ReturnType<typeof createHistoricalRateResolver> | null;
  snapshotByDate: Map<string, NetWorthSourceData['snapshots'][number]>;
};

function buildNetWorthHistoryContext(sourceData: NetWorthSourceData): NetWorthHistoryContext {
  const datedSavingsTransactions = buildDatedSavingsTransactions(sourceData.savingsTransactions);
  const datedHoldingTransactions = buildDatedHoldingTransactions(sourceData.holdingTransactions);
  const datedPropertyTransactions = buildDatedPropertyTransactions(sourceData.propertyTransactions);
  const datedPensionTransactions = buildDatedPensionTransactions(sourceData.pensionTransactions);
  const datedDebtPayments = buildDatedDebtPayments(sourceData.debtPayments);
  const holdingPricesById = groupByNumericId(
    sourceData.holdingPrices ?? [],
    (item) => item.holdingId,
  );
  for (const prices of holdingPricesById.values())
    prices.sort((left, right) => left.eodDate.localeCompare(right.eodDate));
  return {
    ratesAt: sourceData.historicalRates?.length
      ? createHistoricalRateResolver(sourceData.historicalRates)
      : null,
    savingsByAccount: groupByNumericId(datedSavingsTransactions, (item) => item.accountId),
    holdingsById: groupByNumericId(datedHoldingTransactions, (item) => item.holdingId),
    holdingPricesById,
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
  month: HistoryPeriod,
  index: number,
): NetWorthHistoryPoint {
  // Current-month snapshots can predate a price sync or direct holding edit.
  // Rebuild that point from source data; completed months remain immutable snapshots.
  const snapshot =
    month.isCurrent || month.snapshotDate === null
      ? undefined
      : context.snapshotByDate.get(month.snapshotDate);
  if (snapshot) {
    return {
      id: index + 1,
      month: month.label,
      year: month.year,
      date: month.asOfDate,
      totalValue: toNumberOrZero(snapshot.totalValue),
      currency: snapshot.baseCurrency,
      isEstimated: snapshot.isEstimated,
    };
  }
  const historicalRates = context.ratesAt
    ? context.ratesAt(month.asOfDate)
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
    date: month.asOfDate,
    totalValue: sumMoney([savings, brokerage.value, propertyEquity, pension, -liabilities]),
    currency: BASE_CURRENCY,
    isEstimated: historicalRates.isEstimated || brokerage.isEstimated,
  };
}
