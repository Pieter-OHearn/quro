import type { HoldingTransaction, Mortgage, Property, PropertyTransaction } from '@quro/shared';

export type { HoldingTransactionType as HoldingTxnType } from '@quro/shared';
export type { PropertyTransactionType as PropertyTxnType } from '@quro/shared';

const INVESTMENT_PROPERTY_TYPES = new Set([
  'Buy-to-Let',
  'Investment',
  'Holiday Home',
  'Commercial',
]);
const JOINT_PROPERTY_SHARE = 0.5;

export type Position = {
  shares: number;
  avgCost: number;
  realizedGain: number;
  totalDividends: number;
};

type PositionState = {
  shares: number;
  totalCost: number;
  realizedGain: number;
  totalDividends: number;
};

function applyBuy(state: PositionState, tShares: number, tPrice: number): void {
  state.totalCost += tShares * tPrice;
  state.shares += tShares;
}

function applySell(state: PositionState, tShares: number, tPrice: number): void {
  const avgCostNow = state.shares > 0 ? state.totalCost / state.shares : 0;
  state.realizedGain += (tPrice - avgCostNow) * tShares;
  state.totalCost -= tShares * avgCostNow;
  state.shares = Math.max(0, state.shares - tShares);
}

function applyTxn(state: PositionState, t: HoldingTransaction): void {
  const tShares = Number(t.shares ?? 0);
  const tPrice = Number(t.price ?? 0);
  if (t.type === 'buy' && tShares > 0) {
    applyBuy(state, tShares, tPrice);
  } else if (t.type === 'sell' && tShares > 0) {
    applySell(state, tShares, tPrice);
  } else if (t.type === 'dividend') {
    state.totalDividends += tPrice;
  }
}

function computeSortedPosition(txns: readonly HoldingTransaction[]): Position {
  const state: PositionState = { shares: 0, totalCost: 0, realizedGain: 0, totalDividends: 0 };
  for (const txn of txns) applyTxn(state, txn);
  return {
    shares: state.shares,
    avgCost: state.shares > 0 ? state.totalCost / state.shares : 0,
    realizedGain: state.realizedGain,
    totalDividends: state.totalDividends,
  };
}

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
    holdings.map(({ id }) => [
      id,
      computeSortedPosition((grouped.get(id) ?? []).sort((a, b) => a.date.localeCompare(b.date))),
    ]),
  );
}

export function computePosition(holdingId: number, txns: readonly HoldingTransaction[]): Position {
  return computeSortedPosition(
    txns.filter((txn) => txn.holdingId === holdingId).sort((a, b) => a.date.localeCompare(b.date)),
  );
}

export type DatedHoldingTransaction = HoldingTransaction & { timestamp: number };
export type DatedPropertyTransaction = PropertyTransaction & { timestamp: number };

export function formatMonthLabel(monthStart: number): string {
  return new Date(monthStart).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function isInvestmentProperty(propertyType: string): boolean {
  return INVESTMENT_PROPERTY_TYPES.has(propertyType);
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

/** The portfolio is personal, so a joint property contributes an equal share. */
export function getPropertyOwnershipShare(property: Property): number {
  return property.isJoint ? JOINT_PROPERTY_SHARE : 1;
}
