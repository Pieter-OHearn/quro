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
  type NetWorthYearStart,
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
  mortgageTransactions,
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
const DECEMBER = 11;

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
  mortgageId: number | null;
  currency: string;
} & Archivable;
type PropertyTransactionRow = {
  propertyId: number;
  type: string;
  amount: unknown;
  date: string;
};
type MortgageRepaymentRow = {
  mortgageId: number;
  type: string;
  amount: unknown;
  interest: unknown;
  principal: unknown;
  unappliedPrincipal: unknown;
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

type DatedPropertyValuation = {
  propertyId: number;
  amount: number;
  timestamp: number;
};

type DatedMortgageRepayment = {
  mortgageId: number;
  principal: number;
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
  mortgageRepayments: MortgageRepaymentRow[];
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
  // A second boundary row preserves history presence for ledgers without a valuation.
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

// A property's past debt is its mortgage's balance plus the principal repaid after the cutoff, so
// only repayments inside the window matter; one boundary row per mortgage keeps history presence
// for a household whose only records are repayments before the window.
function loadMortgageRepaymentHistory(access: SQL | undefined, start: string) {
  const columns = {
    mortgageId: mortgageTransactions.mortgageId,
    type: mortgageTransactions.type,
    amount: mortgageTransactions.amount,
    interest: mortgageTransactions.interest,
    principal: mortgageTransactions.principal,
    unappliedPrincipal: mortgageTransactions.unappliedPrincipal,
    date: mortgageTransactions.date,
  };
  const repayments = and(access, eq(mortgageTransactions.type, 'repayment'));
  const boundary = db
    .selectDistinctOn([mortgageTransactions.mortgageId], columns)
    .from(mortgageTransactions)
    .innerJoin(mortgages, eq(mortgageTransactions.mortgageId, mortgages.id))
    .where(and(repayments, lt(mortgageTransactions.date, start)))
    .orderBy(
      mortgageTransactions.mortgageId,
      desc(mortgageTransactions.date),
      desc(mortgageTransactions.id),
    );
  return db
    .select(columns)
    .from(mortgageTransactions)
    .innerJoin(mortgages, eq(mortgageTransactions.mortgageId, mortgages.id))
    .where(and(repayments, gte(mortgageTransactions.date, start)))
    .unionAll(boundary);
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
  const mortgageAccess = ownedOrJointPredicate(mortgages, userId, partnerId);

  const [savings, savingsTxns, propertyRows, propertyTxns, mortgageRows, repayments] =
    await Promise.all([
      loadHouseholdRows(savingsAccounts, userId, partnerId, { includeArchived: true }),
      loadSavingsHistory(savingsAccess, windowStart),
      loadHouseholdRows(properties, userId, partnerId, { includeArchived: true }),
      loadPropertyHistory(propertyAccess, windowStart),
      loadHouseholdRows(mortgages, userId, partnerId, { includeArchived: true }),
      loadMortgageRepaymentHistory(mortgageAccess, windowStart),
    ]);

  return {
    savings,
    savingsTransactions: savingsTxns,
    properties: propertyRows,
    propertyTransactions: propertyTxns,
    mortgages: mortgageRows,
    mortgageRepayments: repayments,
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

// A valuation counts from its date, so one dated after today is left out: it sets neither a point
// nor the value before the first valuation, just as it does not set the current value yet.
function buildDatedPropertyValuations(
  transactions: readonly PropertyTransactionRow[],
  now = Date.now(),
): DatedPropertyValuation[] {
  return transactions
    .filter((transaction) => transaction.type === 'valuation')
    .map((transaction) => ({
      propertyId: transaction.propertyId,
      amount: toNumberOrZero(transaction.amount),
      timestamp: toUtcTimestamp(transaction.date),
    }))
    .filter((transaction) => Number.isFinite(transaction.timestamp) && transaction.timestamp <= now)
    .sort((left, right) => left.timestamp - right.timestamp);
}

// The principal a repayment applied to its mortgage: its principal (the amount less interest when
// it was recorded without a split) less what the zero clamp absorbed.
function appliedPrincipal(repayment: MortgageRepaymentRow): number {
  const principal =
    repayment.principal == null
      ? Math.max(0, toNumberOrZero(repayment.amount) - toNumberOrZero(repayment.interest))
      : toNumberOrZero(repayment.principal);
  return Math.max(0, principal - toNumberOrZero(repayment.unappliedPrincipal));
}

function buildDatedMortgageRepayments(
  repayments: readonly MortgageRepaymentRow[],
): DatedMortgageRepayment[] {
  return repayments
    .filter((repayment) => repayment.type === 'repayment')
    .map((repayment) => ({
      mortgageId: repayment.mortgageId,
      principal: appliedPrincipal(repayment),
      timestamp: toUtcTimestamp(repayment.date),
    }))
    .filter((repayment) => Number.isFinite(repayment.timestamp))
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

function buildMonthlyPeriod(month: number, now: number): HistoryPeriod {
  const isCurrent = month === monthStartUtc(now);
  const cutoff = isCurrent ? now : monthEndUtc(month);
  return {
    cutoff,
    asOfDate: toIsoDate(new Date(cutoff)),
    snapshotDate: toIsoDate(new Date(monthEndUtc(month))),
    isCurrent,
    label: formatMonthShort(month),
    year: new Date(month).getUTCFullYear(),
  };
}

function buildMonthlyPeriods(firstMonth: number, now: number): HistoryPeriod[] {
  const currentMonth = monthStartUtc(now);
  const periods: HistoryPeriod[] = [];
  for (let month = firstMonth; month <= currentMonth; month = addMonthsUtc(month, 1)) {
    periods.push(buildMonthlyPeriod(month, now));
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

/**
 * The point "year to date" measures from: the last month end before 1 January (the previous
 * year end) when the household has a record before this year; otherwise the first point of this
 * year, the month end of its first record (or now, when that is this month). Null without records.
 */
export function buildYearStartPeriod(
  now: number,
  firstRecordDate: string | null,
): (HistoryPeriod & { from: NetWorthYearStart['from'] }) | null {
  if (firstRecordDate === null) return null;
  const firstRecord = toUtcTimestamp(firstRecordDate);
  if (!Number.isFinite(firstRecord)) return null;
  const yearStart = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  if (firstRecord < yearStart) {
    const december = Date.UTC(new Date(now).getUTCFullYear() - 1, DECEMBER, 1);
    return { ...buildMonthlyPeriod(december, now), from: 'previous-year-end' };
  }
  const month = Math.min(monthStartUtc(firstRecord), monthStartUtc(now));
  return { ...buildMonthlyPeriod(month, now), from: 'first-point' };
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

// Each active mortgage's balance at the cutoff: its outstanding balance plus the principal its
// repayments applied after the cutoff.
function buildActiveMortgageBalanceAtCutoff(
  userMortgages: readonly MortgageRow[],
  repaymentsByMortgageId: ReadonlyMap<number, readonly DatedMortgageRepayment[]>,
  cutoff: number,
): Map<number, number> {
  const balances = new Map<number, number>();
  for (const mortgage of userMortgages) {
    if (isArchivedAtCutoff(mortgage, cutoff)) continue;
    let balance = toNumberOrZero(mortgage.outstandingBalance);
    for (const repayment of repaymentsByMortgageId.get(mortgage.id) ?? []) {
      if (repayment.timestamp > cutoff) balance += repayment.principal;
    }
    balances.set(mortgage.id, balance);
  }
  return balances;
}

// A property's value at the cutoff is its latest valuation by then: the purchase price before
// its first valuation, or the current value when it has none.
function resolvePropertyValueAtCutoff(
  property: PropertyRow,
  valuations: readonly DatedPropertyValuation[],
  cutoff: number,
): number {
  let propertyValue =
    valuations.length > 0
      ? toNumberOrZero(property.purchasePrice)
      : toNumberOrZero(property.currentValue);
  for (const valuation of valuations) {
    if (valuation.timestamp > cutoff) break;
    propertyValue = valuation.amount;
  }
  return propertyValue;
}

function computePropertyEquityAtCutoff(
  userProperties: readonly PropertyRow[],
  valuationsByPropertyId: ReadonlyMap<number, readonly DatedPropertyValuation[]>,
  mortgageBalanceById: ReadonlyMap<number, number>,
  cutoff: number,
  rates: Map<string, number>,
): number {
  return sumMoney(
    userProperties.map((property) => {
      if (isArchivedAtCutoff(property, cutoff)) return 0;
      const valuations = valuationsByPropertyId.get(property.id) ?? [];
      const propertyValue = resolvePropertyValueAtCutoff(property, valuations, cutoff);
      const mortgageBalance = getPropertyDebt(property, mortgageBalanceById);
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
  /** Mortgage repayments: the history adds back the principal they applied after a cutoff. */
  mortgageRepayments: MortgageRepaymentRow[];
  debts: DebtRow[];
  debtPayments: DebtPaymentRow[];
  snapshots: Array<typeof netWorthSnapshots.$inferSelect>;
  /** The points to build; the default range when absent. */
  periods?: HistoryPeriod[];
  /** The point "year to date" measures from, when it was asked for and the household has one. */
  yearStart?: ReturnType<typeof buildYearStartPeriod>;
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
 * caller's own and the partner's joint savings, property and mortgage rows, the caller's holding,
 * pension and debt rows) or of the caller's stored snapshots. Null when there is none.
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
        .select({ first: min(mortgageTransactions.date) })
        .from(mortgageTransactions)
        .innerJoin(mortgages, eq(mortgageTransactions.mortgageId, mortgages.id))
        .where(ownedOrJointPredicate(mortgages, userId, partnerId)),
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

/**
 * The points to build (the range, plus the year-start point when asked for), the stored snapshots
 * that can stand in for them, and the first date whose ledgers must be replayed.
 */
async function planHistoryWindow(
  userId: number,
  partnerId: number | null,
  range: NetWorthRange,
  withYearStart: boolean,
) {
  const now = Date.now();
  const needsFirstRecord = range === 'all' || withYearStart;
  const firstRecordDate = needsFirstRecord ? await loadFirstRecordDate(userId, partnerId) : null;
  const periods = buildHistoryPeriods(range, now, firstRecordDate);
  const yearStart = withYearStart ? buildYearStartPeriod(now, firstRecordDate) : null;
  // Every point to compute, oldest first: the window and the snapshots must reach all of them.
  const covered = [...periods, ...(yearStart ? [yearStart] : [])].sort(
    (left, right) => left.cutoff - right.cutoff,
  );
  const firstPeriod = covered[0];
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
  const firstMissing = covered.find(
    (period) =>
      period.isCurrent || period.snapshotDate === null || !snapshotDates.has(period.snapshotDate),
  )!;
  return { periods, yearStart, snapshots, windowStart: firstMissing.asOfDate };
}

export async function loadNetWorthSourceData(
  userId: number,
  partnerId: number | null,
  range: NetWorthRange = DEFAULT_NET_WORTH_RANGE,
  options: { yearStart?: boolean } = {},
): Promise<NetWorthSourceData> {
  const { periods, yearStart, snapshots, windowStart } = await planHistoryWindow(
    userId,
    partnerId,
    range,
    options.yearStart === true,
  );
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
    // A repayment inherits its mortgage's jointness.
    mortgageRepayments: scopeHouseholdRows(
      'mortgageRepayments',
      jointScoped.mortgageRepayments,
      (row) =>
        jointScoped.mortgages.some((parent) => parent.id === row.mortgageId && parent.isJoint),
    ),
    debts: debtsData,
    debtPayments: debtPaymentsData,
    snapshots,
    periods,
    yearStart,
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
  return buildHistoryWithContext(sourceData, buildNetWorthHistoryContext(sourceData));
}

function buildHistoryWithContext(
  sourceData: NetWorthSourceData,
  context: NetWorthHistoryContext,
): NetWorthHistoryPoint[] {
  const periods = sourceData.periods ?? buildHistoryPeriods();
  if (!hasNetWorthHistory(context, sourceData.snapshots)) {
    return buildFallbackNetWorthHistory(sourceData, periods[periods.length - 1]);
  }
  return periods.map((period, index) =>
    buildNetWorthHistoryPoint(sourceData, context, period, index),
  );
}

/**
 * The history and the year-start point of the dashboard summary, from one source and one
 * context, so the year-start value is computed exactly like a point of the series.
 */
export function buildDashboardHistory(sourceData: NetWorthSourceData): {
  netWorth: NetWorthHistoryPoint[];
  yearStart: NetWorthYearStart | null;
} {
  const context = buildNetWorthHistoryContext(sourceData);
  const period = sourceData.yearStart ?? null;
  const point = period ? buildNetWorthHistoryPoint(sourceData, context, period, 0) : null;
  return {
    netWorth: buildHistoryWithContext(sourceData, context),
    yearStart:
      period && point
        ? {
            from: period.from,
            month: point.month,
            year: point.year,
            date: point.date,
            totalValue: point.totalValue,
            currency: point.currency as NetWorthYearStart['currency'],
            isEstimated: point.isEstimated,
          }
        : null,
  };
}

type NetWorthHistoryContext = {
  savingsByAccount: Map<number, DatedSavingsTransaction[]>;
  holdingsById: Map<number, DatedHoldingTransaction[]>;
  holdingPricesById: Map<number, HoldingPriceRow[]>;
  valuationsByPropertyId: Map<number, DatedPropertyValuation[]>;
  repaymentsByMortgageId: Map<number, DatedMortgageRepayment[]>;
  pensionsByPotId: Map<number, DatedPensionTransaction[]>;
  debtPaymentsByDebtId: Map<number, DatedDebtPayment[]>;
  ratesAt: ReturnType<typeof createHistoricalRateResolver> | null;
  snapshotByDate: Map<string, NetWorthSourceData['snapshots'][number]>;
};

function buildNetWorthHistoryContext(sourceData: NetWorthSourceData): NetWorthHistoryContext {
  const datedSavingsTransactions = buildDatedSavingsTransactions(sourceData.savingsTransactions);
  const datedHoldingTransactions = buildDatedHoldingTransactions(sourceData.holdingTransactions);
  const datedPropertyValuations = buildDatedPropertyValuations(sourceData.propertyTransactions);
  const datedMortgageRepayments = buildDatedMortgageRepayments(sourceData.mortgageRepayments);
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
    valuationsByPropertyId: groupByNumericId(datedPropertyValuations, (item) => item.propertyId),
    repaymentsByMortgageId: groupByNumericId(datedMortgageRepayments, (item) => item.mortgageId),
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
    context.valuationsByPropertyId.size,
    context.repaymentsByMortgageId.size,
    context.pensionsByPotId.size,
    context.debtPaymentsByDebtId.size,
  ];
  return transactionCounts.some((count) => count > 0) || snapshots.length > 0;
}

function buildNetWorthHistoryPoint(
  sourceData: NetWorthSourceData,
  context: NetWorthHistoryContext,
  period: HistoryPeriod,
  index: number,
): NetWorthHistoryPoint {
  // Current-month snapshots can predate a price sync or direct holding edit.
  // Rebuild that point from source data; completed months remain immutable snapshots.
  const snapshot =
    period.isCurrent || period.snapshotDate === null
      ? undefined
      : context.snapshotByDate.get(period.snapshotDate);
  if (snapshot) {
    return {
      id: index + 1,
      month: period.label,
      year: period.year,
      date: period.asOfDate,
      totalValue: toNumberOrZero(snapshot.totalValue),
      currency: snapshot.baseCurrency,
      isEstimated: snapshot.isEstimated,
    };
  }
  const historicalRates = context.ratesAt
    ? context.ratesAt(period.asOfDate)
    : { rates: sourceData.rates, isEstimated: true };
  const savings = computeSavingsAtCutoff(
    sourceData.savings,
    context.savingsByAccount,
    period.cutoff,
    historicalRates.rates,
  );
  const brokerage = computeBrokerageAtCutoff(
    sourceData.holdings,
    context.holdingsById,
    context.holdingPricesById,
    period.cutoff,
    period.asOfDate,
    historicalRates.rates,
  );
  const propertyEquity = computePropertyEquityAtCutoff(
    sourceData.properties,
    context.valuationsByPropertyId,
    buildActiveMortgageBalanceAtCutoff(
      sourceData.mortgages,
      context.repaymentsByMortgageId,
      period.cutoff,
    ),
    period.cutoff,
    historicalRates.rates,
  );
  const pension = computePensionAtCutoff(
    sourceData.pensions,
    context.pensionsByPotId,
    period.cutoff,
    historicalRates.rates,
  );
  const liabilities = computeDebtLiabilitiesAtCutoff(
    sourceData.debts,
    context.debtPaymentsByDebtId,
    period.cutoff,
    historicalRates.rates,
  );
  return {
    id: index + 1,
    month: period.label,
    year: period.year,
    date: period.asOfDate,
    totalValue: sumMoney([savings, brokerage.value, propertyEquity, pension, -liabilities]),
    currency: BASE_CURRENCY,
    isEstimated: historicalRates.isEstimated || brokerage.isEstimated,
  };
}
