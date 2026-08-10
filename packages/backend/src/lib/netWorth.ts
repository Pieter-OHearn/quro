import type { CurrencyCode } from '@quro/shared';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  debts,
  holdingTransactions,
  holdings,
  mortgages,
  netWorthSnapshots,
  pensionPots,
  properties,
  savingsAccounts,
} from '../db/schema';
import { convertToBaseCurrency, FX_BASE_CURRENCY } from './currencyRateCache';
import { getCurrentRatesToBaseCurrency } from './currencyRateSync';
import { getAcceptedPartnerId, ownedOrJointPredicate } from './partner';

const JOINT_WEIGHT = 0.5;
const ISO_MONTH_LENGTH = 7;
const DATE_END_OF_MONTH = 0;

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DerivedAllocation = {
  id: number;
  name: string;
  value: number;
  color: string;
  currency: CurrencyCode;
};

export type DerivedAllocationSummary = {
  allocations: DerivedAllocation[];
  liabilitiesTotal: number;
  debtCount: number;
};

type MoneyRow = { currency: string };
type SavingsRow = MoneyRow & { balance: unknown };
type HoldingRow = MoneyRow & { id: number; currentPrice: unknown };
type HoldingTransactionRow = { holdingId: number; type: string; shares: unknown };
type PropertyRow = MoneyRow & {
  currentValue: unknown;
  mortgage: unknown;
  mortgageId: number | null;
};
type PensionRow = MoneyRow & { balance: unknown };
type MortgageRow = { id: number; outstandingBalance: unknown };
type DebtRow = MoneyRow & { remainingBalance: unknown };

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeSharesByHolding(txns: readonly HoldingTransactionRow[]): Map<number, number> {
  const shares = new Map<number, number>();
  for (const transaction of txns) {
    const current = shares.get(transaction.holdingId) ?? 0;
    const delta = toNumber(transaction.shares);
    if (transaction.type === 'buy') shares.set(transaction.holdingId, current + delta);
    if (transaction.type === 'sell') shares.set(transaction.holdingId, current - delta);
  }
  return shares;
}

function allocation(id: number, name: string, value: number, color: string): DerivedAllocation {
  return { id, name, value, color, currency: FX_BASE_CURRENCY };
}

export function computeDerivedAllocations(
  rates: ReadonlyMap<string, number>,
  userSavings: readonly SavingsRow[],
  userHoldings: readonly HoldingRow[],
  userHoldingTxns: readonly HoldingTransactionRow[],
  userProperties: readonly PropertyRow[],
  userPensions: readonly PensionRow[],
  userMortgages: readonly MortgageRow[],
  userDebts: readonly DebtRow[],
): DerivedAllocationSummary {
  const convert = (amount: number, currency: string) =>
    convertToBaseCurrency(amount, currency, rates);
  const savings = userSavings.reduce(
    (sum, account) => sum + convert(toNumber(account.balance), account.currency),
    0,
  );
  const shares = computeSharesByHolding(userHoldingTxns);
  const brokerage = userHoldings.reduce(
    (sum, holding) =>
      sum +
      convert(
        Math.max(0, shares.get(holding.id) ?? 0) * toNumber(holding.currentPrice),
        holding.currency,
      ),
    0,
  );
  const mortgageById = new Map(
    userMortgages.map((mortgage) => [mortgage.id, toNumber(mortgage.outstandingBalance)]),
  );
  const propertyEquity = userProperties.reduce((sum, property) => {
    const mortgage =
      property.mortgageId === null
        ? toNumber(property.mortgage)
        : (mortgageById.get(property.mortgageId) ?? 0);
    return sum + convert(toNumber(property.currentValue) - mortgage, property.currency);
  }, 0);
  const pension = userPensions.reduce(
    (sum, pot) => sum + convert(toNumber(pot.balance), pot.currency),
    0,
  );
  const liabilitiesTotal = userDebts.reduce(
    (sum, debt) => sum + convert(toNumber(debt.remainingBalance), debt.currency),
    0,
  );

  return {
    allocations: [
      allocation(1, 'Savings', savings, '#6366f1'),
      allocation(2, 'Brokerage', brokerage, '#0ea5e9'),
      allocation(3, 'Property Equity', propertyEquity, '#10b981'),
      allocation(4, 'Pension', pension, '#f59e0b'),
    ],
    liabilitiesTotal,
    debtCount: userDebts.length,
  };
}

export function monthStart(date: string): string {
  return `${date.slice(0, ISO_MONTH_LENGTH)}-01`;
}

export function monthEnd(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, DATE_END_OF_MONTH))
    .toISOString()
    .slice(0, 10);
}

export async function invalidateSnapshotsFrom(
  tx: DbTransaction,
  userId: number,
  fromDate: string,
): Promise<void> {
  await tx
    .delete(netWorthSnapshots)
    .where(
      and(
        eq(netWorthSnapshots.userId, userId),
        gte(netWorthSnapshots.snapshotDate, monthStart(fromDate)),
      ),
    );
}

export function earliestDate(left: string, right: string): string {
  return left <= right ? left : right;
}

export type HistoricalHoldingPrice = { eodDate: string; closePrice: unknown };

export function resolveHistoricalHoldingPrice(
  rows: readonly HistoricalHoldingPrice[],
  cutoffDate: string,
): number | null {
  const sorted = [...rows].sort((left, right) => left.eodDate.localeCompare(right.eodDate));
  let low = 0;
  let high = sorted.length - 1;
  let candidate = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (sorted[mid].eodDate <= cutoffDate) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return candidate < 0 ? null : toNumber(sorted[candidate].closePrice);
}

async function loadSnapshotInputs(userId: number) {
  const partnerId = await getAcceptedPartnerId(userId);
  const savingsAccess = ownedOrJointPredicate(savingsAccounts, userId, partnerId);
  const mortgageAccess = ownedOrJointPredicate(mortgages, userId, partnerId);
  const propertyAccess = ownedOrJointPredicate(properties, userId, partnerId);
  const [rates, savings, holdingRows, holdingTxns, propertyRows, mortgageRows, pensions, debtRows] =
    await Promise.all([
      getCurrentRatesToBaseCurrency(FX_BASE_CURRENCY),
      db
        .select()
        .from(savingsAccounts)
        .where(and(savingsAccess, isNull(savingsAccounts.archivedAt))),
      db
        .select()
        .from(holdings)
        .where(and(eq(holdings.userId, userId), isNull(holdings.archivedAt))),
      db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
      db
        .select()
        .from(properties)
        .where(and(propertyAccess, isNull(properties.archivedAt))),
      db
        .select()
        .from(mortgages)
        .where(and(mortgageAccess, isNull(mortgages.archivedAt))),
      db
        .select()
        .from(pensionPots)
        .where(and(eq(pensionPots.userId, userId), isNull(pensionPots.archivedAt))),
      db
        .select()
        .from(debts)
        .where(and(eq(debts.userId, userId), isNull(debts.archivedAt))),
    ]);
  const weigh = <T extends { isJoint: boolean }>(row: T, fields: string[]): T => {
    if (!row.isJoint) return row;
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        fields.includes(key) ? toNumber(value) * JOINT_WEIGHT : value,
      ]),
    ) as T;
  };
  return {
    rates,
    savings: savings.map((row) => weigh(row, ['balance'])),
    holdings: holdingRows,
    holdingTransactions: holdingTxns,
    properties: propertyRows.map((row) =>
      weigh(row, ['currentValue', 'purchasePrice', 'mortgage']),
    ),
    mortgages: mortgageRows.map((row) => weigh(row, ['outstandingBalance'])),
    pensions,
    debts: debtRows,
  };
}

export async function upsertCurrentNetWorthSnapshot(
  userId: number,
  now = new Date(),
): Promise<void> {
  const input = await loadSnapshotInputs(userId);
  const summary = computeDerivedAllocations(
    input.rates,
    input.savings,
    input.holdings,
    input.holdingTransactions,
    input.properties,
    input.pensions,
    input.mortgages,
    input.debts,
  );
  const values = Object.fromEntries(
    summary.allocations.map((item) => [item.name, item.value]),
  ) as Record<string, number>;
  const savings = values.Savings ?? 0;
  const brokerage = values.Brokerage ?? 0;
  const propertyEquity = values['Property Equity'] ?? 0;
  const pension = values.Pension ?? 0;
  const totalValue = savings + brokerage + propertyEquity + pension - summary.liabilitiesTotal;
  const snapshot = {
    userId,
    snapshotDate: monthEnd(now),
    baseCurrency: FX_BASE_CURRENCY,
    savings,
    brokerage,
    propertyEquity,
    pension,
    liabilities: summary.liabilitiesTotal,
    totalValue,
    isEstimated: false,
    computedAt: now,
  };
  await db
    .insert(netWorthSnapshots)
    .values(snapshot)
    .onConflictDoUpdate({
      target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
      set: {
        savings: sql`excluded.savings`,
        brokerage: sql`excluded.brokerage`,
        propertyEquity: sql`excluded.property_equity`,
        pension: sql`excluded.pension`,
        liabilities: sql`excluded.liabilities`,
        totalValue: sql`excluded.total_value`,
        isEstimated: sql`excluded.is_estimated`,
        computedAt: sql`excluded.computed_at`,
      },
    });
}
