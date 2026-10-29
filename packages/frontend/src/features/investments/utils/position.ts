import {
  computeHoldingPosition,
  householdShare,
  isInvestmentPropertyType,
  propertyEquity,
  toUtcTimestamp,
  type HoldingPosition,
  type HoldingTransaction,
  type Mortgage,
  type MortgageTransaction,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';

export type { HoldingTransactionType as HoldingTxnType } from '@quro/shared';
export type { PropertyTransactionType as PropertyTxnType } from '@quro/shared';

/** A holding's position, computed by the shared position rule the dashboard also uses. */
export type Position = HoldingPosition;

export function groupHoldingTransactions(txns: readonly HoldingTransaction[]) {
  const grouped = new Map<number, HoldingTransaction[]>();
  for (const txn of txns) {
    const group = grouped.get(txn.holdingId);
    if (group) group.push(txn);
    else grouped.set(txn.holdingId, [txn]);
  }
  return grouped;
}

export function computePositions(
  holdings: readonly { id: number }[],
  txns: readonly HoldingTransaction[],
): Record<number, Position> {
  const grouped = groupHoldingTransactions(txns);
  return Object.fromEntries(
    holdings.map(({ id }) => [id, computeHoldingPosition(grouped.get(id) ?? [])]),
  );
}

export function computePosition(holdingId: number, txns: readonly HoldingTransaction[]): Position {
  return computeHoldingPosition(txns.filter((txn) => txn.holdingId === holdingId));
}

export type DatedHoldingTransaction = HoldingTransaction & { timestamp: number };
export type DatedPropertyTransaction = PropertyTransaction & { timestamp: number };

export function formatMonthLabel(monthStart: number): string {
  return new Date(monthStart).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/** Whether rent income and expenses apply: the same rule the API enforces. */
export function isInvestmentProperty(propertyType: string): boolean {
  return isInvestmentPropertyType(propertyType);
}

/** A mortgage repayment by date: the principal it applied to the balance. */
export type DatedMortgageRepayment = { principal: number; timestamp: number };

/** Each mortgage's repayments by date, oldest first. */
export function groupMortgageRepayments(
  txns: readonly MortgageTransaction[],
): Map<number, DatedMortgageRepayment[]> {
  const byMortgage = new Map<number, DatedMortgageRepayment[]>();
  for (const txn of txns) {
    const timestamp = toUtcTimestamp(txn.date);
    if (txn.type !== 'repayment' || !Number.isFinite(timestamp)) continue;
    const principal = txn.principal ?? Math.max(0, txn.amount - (txn.interest ?? 0));
    const repayment = { principal: principal - (txn.unappliedPrincipal ?? 0), timestamp };
    const rows = byMortgage.get(txn.mortgageId);
    if (rows) rows.push(repayment);
    else byMortgage.set(txn.mortgageId, [repayment]);
  }
  for (const rows of byMortgage.values()) rows.sort((a, b) => a.timestamp - b.timestamp);
  return byMortgage;
}

/**
 * A property's equity in its own currency as of `cutoff` (records dated at or before it count),
 * as net worth weights it: the value then (its latest valuation by then, the purchase price
 * before its first, or the current value when it has none) less its linked mortgage's balance
 * then (the server's current debt plus the principal repaid after the cutoff).
 */
export function propertyEquityAt(
  property: Property,
  valuations: readonly { type: string; amount: number; timestamp: number }[],
  repayments: readonly DatedMortgageRepayment[],
  linkedMortgage: Mortgage | undefined,
  cutoff: number,
): number {
  const ownValuations = valuations.filter((txn) => txn.type === 'valuation');
  let value = ownValuations.length > 0 ? property.purchasePrice : property.currentValue;
  for (const txn of ownValuations) {
    if (txn.timestamp > cutoff) break;
    value = txn.amount;
  }
  // An archived or missing mortgage is not among the active ones and carries no debt.
  if (!linkedMortgage)
    return propertyEquity({ currentValue: value, isJoint: property.isJoint }, null);
  let debt = property.debt;
  for (const repayment of repayments) {
    if (repayment.timestamp > cutoff) debt += repayment.principal;
  }
  return propertyEquity(
    { currentValue: value, isJoint: property.isJoint },
    { outstandingBalance: debt, isJoint: linkedMortgage.isJoint },
  );
}

/** The portfolio is personal, so a joint property contributes the household share. */
export function getPropertyOwnershipShare(property: Property): number {
  return householdShare(property.isJoint);
}

const SHARE_DECIMALS = 4;

/** A share count with up to four decimals and no trailing zeros (`12.5`, `40`). */
export function formatShares(shares: number): string {
  return shares.toFixed(SHARE_DECIMALS).replace(/\.?0+$/, '');
}
