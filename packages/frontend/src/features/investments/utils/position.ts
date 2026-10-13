import {
  computeHoldingPosition,
  householdShare,
  isInvestmentPropertyType,
  type HoldingPosition,
  type HoldingTransaction,
  type Mortgage,
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

export function getPropertyMortgageBalance(
  property: Property,
  mortgageById: Map<number, Mortgage>,
): number {
  if (property.mortgageId != null) {
    const linked = mortgageById.get(property.mortgageId);
    if (linked) return linked.outstandingBalance;
  }
  return property.mortgage;
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
