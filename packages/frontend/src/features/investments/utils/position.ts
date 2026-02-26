import type {
  HoldingTransaction,
  Mortgage,
  Property,
  PropertyTransaction,
} from "@quro/shared";

export type HoldingTxnType = "buy" | "sell" | "dividend";
export type PropertyTxnType = "repayment" | "valuation" | "rent_income" | "expense";

const INVESTMENT_PROPERTY_TYPES = new Set(["Buy-to-Let", "Investment", "Holiday Home", "Commercial"]);

export type Position = {
  shares: number;
  avgCost: number;
  realizedGain: number;
  totalDividends: number;
};

type PositionState = { shares: number; totalCost: number; realizedGain: number; totalDividends: number };

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
  if (t.type === "buy" && tShares > 0) {
    applyBuy(state, tShares, tPrice);
  } else if (t.type === "sell" && tShares > 0) {
    applySell(state, tShares, tPrice);
  } else if (t.type === "dividend") {
    state.totalDividends += tPrice;
  }
}

export function computePosition(holdingId: number, txns: HoldingTransaction[]): Position {
  const relevant = txns
    .filter((t) => t.holdingId === holdingId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const state: PositionState = { shares: 0, totalCost: 0, realizedGain: 0, totalDividends: 0 };

  for (const t of relevant) {
    applyTxn(state, t);
  }

  return {
    shares: state.shares,
    avgCost: state.shares > 0 ? state.totalCost / state.shares : 0,
    realizedGain: state.realizedGain,
    totalDividends: state.totalDividends,
  };
}

export type DatedHoldingTransaction = HoldingTransaction & { timestamp: number };
export type DatedPropertyTransaction = PropertyTransaction & { timestamp: number };

export function toUtcTimestamp(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

export function monthStartUtc(timestamp: number): number {
  const d = new Date(timestamp);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function monthEndUtc(monthStart: number): number {
  const d = new Date(monthStart);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999);
}

export function addMonthsUtc(monthStart: number, months: number): number {
  const d = new Date(monthStart);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1);
}

export function formatMonthLabel(monthStart: number): string {
  return new Date(monthStart).toLocaleDateString("en-US", { month: "short" });
}

export function isInvestmentProperty(propertyType: string): boolean {
  return INVESTMENT_PROPERTY_TYPES.has(propertyType);
}

export function getPropertyMortgageBalance(property: Property, mortgageById: Map<number, Mortgage>): number {
  if (property.mortgageId != null) {
    const linked = mortgageById.get(property.mortgageId);
    if (linked) return linked.outstandingBalance;
  }
  return property.mortgage;
}
