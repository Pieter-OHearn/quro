import { getPropertyDebt } from './propertyDebt';
import type { AssetAllocation, DashboardAllocationsSummary, AllocationKey } from '@quro/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
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
import { getAcceptedPartnerId, loadHouseholdRows, scopeHouseholdRows } from './partner';
import { toNumberOrZero } from './numbers';

const ISO_MONTH_LENGTH = 7;
const DATE_END_OF_MONTH = 0;

export type DerivedAllocation = AssetAllocation;
export type DerivedAllocationSummary = DashboardAllocationsSummary;

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

function computeSharesByHolding(txns: readonly HoldingTransactionRow[]): Map<number, number> {
  const shares = new Map<number, number>();
  for (const transaction of txns) {
    const current = shares.get(transaction.holdingId) ?? 0;
    const delta = toNumberOrZero(transaction.shares);
    if (transaction.type === 'buy') shares.set(transaction.holdingId, current + delta);
    if (transaction.type === 'sell') shares.set(transaction.holdingId, current - delta);
  }
  return shares;
}

// Current value of all holdings (net shares × current price), converted with
// `convert`. Holdings that are net short are floored at zero.
export function sumBrokerageValue(
  holdingRows: readonly HoldingRow[],
  transactions: readonly HoldingTransactionRow[],
  convert: (amount: number, currency: string) => number,
): number {
  const shares = computeSharesByHolding(transactions);
  return holdingRows.reduce(
    (sum, holding) =>
      sum +
      convert(
        Math.max(0, shares.get(holding.id) ?? 0) * toNumberOrZero(holding.currentPrice),
        holding.currency,
      ),
    0,
  );
}

function allocation(
  id: number,
  key: AllocationKey,
  name: string,
  value: number,
): DerivedAllocation {
  return { id, key, name, value, currency: FX_BASE_CURRENCY };
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
    (sum, account) => sum + convert(toNumberOrZero(account.balance), account.currency),
    0,
  );
  const brokerage = sumBrokerageValue(userHoldings, userHoldingTxns, convert);
  const mortgageById = new Map(
    userMortgages.map((mortgage) => [mortgage.id, toNumberOrZero(mortgage.outstandingBalance)]),
  );
  const propertyEquity = userProperties.reduce((sum, property) => {
    const mortgage = getPropertyDebt(property, mortgageById);
    return sum + convert(toNumberOrZero(property.currentValue) - mortgage, property.currency);
  }, 0);
  const pension = userPensions.reduce(
    (sum, pot) => sum + convert(toNumberOrZero(pot.balance), pot.currency),
    0,
  );
  const liabilitiesTotal = userDebts.reduce(
    (sum, debt) => sum + convert(toNumberOrZero(debt.remainingBalance), debt.currency),
    0,
  );

  return {
    allocations: [
      allocation(1, 'savings', 'Savings', savings),
      allocation(2, 'brokerage', 'Brokerage', brokerage),
      allocation(3, 'property_equity', 'Property Equity', propertyEquity),
      allocation(4, 'pension', 'Pension', pension),
    ],
    currency: FX_BASE_CURRENCY,
    netWorth: savings + brokerage + propertyEquity + pension - liabilitiesTotal,
    totalAssets: savings + brokerage + propertyEquity + pension,
    portfolioTotal: brokerage,
    liabilitiesCurrency: FX_BASE_CURRENCY,
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

export function earliestDate(left: string, right: string): string {
  return left <= right ? left : right;
}

export type HistoricalHoldingPrice = { eodDate: string; closePrice: unknown };

export function resolveHistoricalHoldingPrice(
  rows: readonly HistoricalHoldingPrice[],
  cutoffDate: string,
): number | null {
  return resolvePreparedHoldingPrice(
    [...rows].sort((left, right) => left.eodDate.localeCompare(right.eodDate)),
    cutoffDate,
  );
}

export function resolvePreparedHoldingPrice(
  sorted: readonly HistoricalHoldingPrice[],
  cutoffDate: string,
): number | null {
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
  return candidate < 0 ? null : toNumberOrZero(sorted[candidate].closePrice);
}

export async function loadSnapshotInputs(
  userId: number,
  options: { partnerId?: number | null; rates?: Map<string, number> } = {},
) {
  const partnerId =
    options.partnerId === undefined ? await getAcceptedPartnerId(userId) : options.partnerId;
  const [rates, savings, holdingRows, holdingTxns, propertyRows, mortgageRows, pensions, debtRows] =
    await Promise.all([
      options.rates ?? getCurrentRatesToBaseCurrency(FX_BASE_CURRENCY),
      loadHouseholdRows(savingsAccounts, userId, partnerId),
      db
        .select()
        .from(holdings)
        .where(and(eq(holdings.userId, userId), isNull(holdings.archivedAt))),
      db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
      loadHouseholdRows(properties, userId, partnerId),
      loadHouseholdRows(mortgages, userId, partnerId),
      db
        .select()
        .from(pensionPots)
        .where(and(eq(pensionPots.userId, userId), isNull(pensionPots.archivedAt))),
      db
        .select()
        .from(debts)
        .where(and(eq(debts.userId, userId), isNull(debts.archivedAt))),
    ]);
  return {
    rates,
    savings: scopeHouseholdRows('savings', savings, (row) => row.isJoint),
    holdings: holdingRows,
    holdingTransactions: holdingTxns,
    properties: scopeHouseholdRows('properties', propertyRows, (row) => row.isJoint),
    mortgages: scopeHouseholdRows('mortgages', mortgageRows, (row) => row.isJoint),
    pensions,
    debts: debtRows,
  };
}

export async function upsertCurrentNetWorthSnapshot(
  userId: number,
  now = new Date(),
  options: Parameters<typeof loadSnapshotInputs>[1] = {},
): Promise<void> {
  const input = await loadSnapshotInputs(userId, options);
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
    summary.allocations.map((item) => [item.key, item.value]),
  ) as Record<string, number>;
  const savings = values.savings ?? 0;
  const brokerage = values.brokerage ?? 0;
  const propertyEquity = values.property_equity ?? 0;
  const pension = values.pension ?? 0;
  const totalValue = summary.netWorth;
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
