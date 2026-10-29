import { getPropertyDebt } from './propertyDebt';
import {
  holdingValue,
  netHoldingShares,
  sumMoney,
  type AssetAllocation,
  type DashboardAllocationsSummary,
  type AllocationKey,
} from '@quro/shared';
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

type DerivedAllocation = AssetAllocation;
export type DerivedAllocationSummary = DashboardAllocationsSummary;

type MoneyRow = { currency: string };
type SavingsRow = MoneyRow & { balance: unknown };
type HoldingRow = MoneyRow & { id: number; currentPrice: unknown };
type HoldingTransactionRow = { holdingId: number; type: string; shares: unknown };
type PropertyRow = MoneyRow & {
  currentValue: unknown;
  mortgageId: number | null;
};
type PensionRow = MoneyRow & { balance: unknown };
type MortgageRow = { id: number; outstandingBalance: unknown };
type DebtRow = MoneyRow & { remainingBalance: unknown };

export function computeSharesByHolding(
  txns: readonly HoldingTransactionRow[],
): Map<number, number> {
  const byHolding = new Map<number, Array<{ type: string; shares: number }>>();
  for (const transaction of txns) {
    const rows = byHolding.get(transaction.holdingId) ?? [];
    rows.push({ type: transaction.type, shares: toNumberOrZero(transaction.shares) });
    byHolding.set(transaction.holdingId, rows);
  }
  return new Map([...byHolding].map(([holdingId, rows]) => [holdingId, netHoldingShares(rows)]));
}

// Current value of all holdings, converted with `convert` and summed in cents. Each holding is
// worth its net shares (floored at zero) × its unrounded current price, rounded to cents once.
export function sumBrokerageValue(
  holdingRows: readonly HoldingRow[],
  transactions: readonly HoldingTransactionRow[],
  convert: (amount: number, currency: string) => number,
): number {
  const shares = computeSharesByHolding(transactions);
  return sumMoney(
    holdingRows.map((holding) =>
      convert(
        holdingValue(shares.get(holding.id) ?? 0, toNumberOrZero(holding.currentPrice)),
        holding.currency,
      ),
    ),
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
  // Every component is a sum of cents: each row is converted to EUR and rounded once, so a
  // component equals the sum of its rows' rounded amounts and the totals add up exactly.
  const savings = sumMoney(
    userSavings.map((account) => convert(toNumberOrZero(account.balance), account.currency)),
  );
  const brokerage = sumBrokerageValue(userHoldings, userHoldingTxns, convert);
  const mortgageById = new Map(
    userMortgages.map((mortgage) => [mortgage.id, toNumberOrZero(mortgage.outstandingBalance)]),
  );
  const propertyEquity = sumMoney(
    userProperties.map((property) =>
      convert(
        toNumberOrZero(property.currentValue) - getPropertyDebt(property, mortgageById),
        property.currency,
      ),
    ),
  );
  const pension = sumMoney(
    userPensions.map((pot) => convert(toNumberOrZero(pot.balance), pot.currency)),
  );
  const liabilitiesTotal = sumMoney(
    userDebts.map((debt) => convert(toNumberOrZero(debt.remainingBalance), debt.currency)),
  );
  const totalAssets = sumMoney([savings, brokerage, propertyEquity, pension]);

  return {
    allocations: [
      allocation(1, 'savings', 'Savings', savings),
      allocation(2, 'brokerage', 'Brokerage', brokerage),
      allocation(3, 'property_equity', 'Property Equity', propertyEquity),
      allocation(4, 'pension', 'Pension', pension),
    ],
    currency: FX_BASE_CURRENCY,
    netWorth: sumMoney([totalAssets, -liabilitiesTotal]),
    totalAssets,
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
