import { fromCents, toCents } from '../utils/money.js';

/** A holding ledger row as the API and the database return it. */
export type HoldingLedgerRow = {
  id?: number;
  type: string;
  shares?: number | null;
  /** Price per share for a buy or sell; the amount received for a dividend. */
  price?: number | null;
  date: string;
};

export type HoldingTrade = {
  type: string;
  shares?: number | null;
  price?: number | null;
};

/**
 * A holding's position after its ledger. Shares and unit prices keep their own precision; money
 * (cost basis, realized gain, dividends) is cents-exact.
 */
export type HoldingPosition = {
  /** Shares held: buys minus sells, never below zero. */
  shares: number;
  /** What the shares held cost, at average cost. */
  costBasis: number;
  /** Cost basis per share held (a unit price), or 0 when nothing is held. */
  avgCost: number;
  realizedGain: number;
  totalDividends: number;
  /** Price per share of the latest buy or sell, if any. */
  lastTradePrice: number | null;
};

export const EMPTY_HOLDING_POSITION: HoldingPosition = Object.freeze({
  shares: 0,
  costBasis: 0,
  avgCost: 0,
  realizedGain: 0,
  totalDividends: 0,
  lastTradePrice: null,
});

// Shares are stored with six decimals, so they are counted in whole millionths: sums are exact and
// never leave a float residue such as 0.1 + 0.2 - 0.3 = 5.6e-17 shares.
const MICRO_SHARES_PER_SHARE = 1_000_000;

function toMicroShares(shares: number): number {
  return Math.round(shares * MICRO_SHARES_PER_SHARE);
}

function fromMicroShares(microShares: number): number {
  return microShares / MICRO_SHARES_PER_SHARE;
}

function finite(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

type PositionState = {
  /** Running buys minus sells; negative after a sell of more than was held. */
  netMicroShares: number;
  costCents: number;
  realizedCents: number;
  dividendCents: number;
  lastTradePrice: number | null;
};

function applyBuy(state: PositionState, microShares: number, price: number): void {
  // Shares that cover an earlier oversell were already counted as sold; they carry no cost.
  const covered = Math.min(microShares, Math.max(0, -state.netMicroShares));
  const added = microShares - covered;
  if (added > 0) state.costCents += toCents(fromMicroShares(added) * price);
  state.netMicroShares += microShares;
  state.lastTradePrice = price;
}

function applySell(state: PositionState, microShares: number, price: number): void {
  const held = Math.max(0, state.netMicroShares);
  // Only the shares held are sold at a gain or loss; the excess has no cost basis.
  const sold = Math.min(microShares, held);
  if (sold > 0) {
    const removedCents =
      sold === held ? state.costCents : Math.round((state.costCents * sold) / held);
    state.realizedCents += toCents(fromMicroShares(sold) * price) - removedCents;
    state.costCents -= removedCents;
  }
  state.netMicroShares -= microShares;
  state.lastTradePrice = price;
}

function applyTrade(state: PositionState, trade: HoldingTrade): void {
  const price = finite(trade.price);
  if (trade.type === 'dividend') {
    state.dividendCents += toCents(price);
    return;
  }
  const microShares = toMicroShares(finite(trade.shares));
  if (microShares <= 0) return;
  if (trade.type === 'buy') applyBuy(state, microShares, price);
  else if (trade.type === 'sell') applySell(state, microShares, price);
}

function toPosition(state: PositionState): HoldingPosition {
  const heldMicroShares = Math.max(0, state.netMicroShares);
  const shares = fromMicroShares(heldMicroShares);
  const costBasis = heldMicroShares > 0 ? fromCents(state.costCents) : 0;
  return {
    shares,
    costBasis,
    avgCost: shares > 0 ? costBasis / shares : 0,
    realizedGain: fromCents(state.realizedCents) || 0,
    totalDividends: fromCents(state.dividendCents) || 0,
    lastTradePrice: state.lastTradePrice,
  };
}

function byDateThenId(left: HoldingLedgerRow, right: HoldingLedgerRow): number {
  return left.date.localeCompare(right.date) || (left.id ?? 0) - (right.id ?? 0);
}

/**
 * Replays one holding's ledger in date order (then id) at average cost. Shares held are buys minus
 * sells, floored at zero, whatever the order: a sell of more than is held sells what is held, and
 * the excess is netted against later buys, which add cost only for the shares beyond it. Each
 * trade's amount is rounded to cents once (shares × unrounded price); dividends add to dividends
 * and never move shares. Rows with no positive share count are ignored.
 */
export function computeHoldingPosition(transactions: readonly HoldingLedgerRow[]): HoldingPosition {
  const state: PositionState = {
    netMicroShares: 0,
    costCents: 0,
    realizedCents: 0,
    dividendCents: 0,
    lastTradePrice: null,
  };
  for (const transaction of [...transactions].sort(byDateThenId)) applyTrade(state, transaction);
  return toPosition(state);
}

/** The position after one more trade, for previews before a trade is saved. */
export function previewHoldingTrade(
  position: HoldingPosition,
  trade: HoldingTrade,
): HoldingPosition {
  const state: PositionState = {
    netMicroShares: toMicroShares(position.shares),
    costCents: toCents(position.costBasis),
    realizedCents: toCents(position.realizedGain),
    dividendCents: toCents(position.totalDividends),
    lastTradePrice: position.lastTradePrice,
  };
  applyTrade(state, trade);
  return toPosition(state);
}

/**
 * Shares held after a ledger: buys minus sells, floored at zero. Order does not matter, so a
 * running total such as an opening balance row can stand in for the rows before it.
 */
export function netHoldingShares(transactions: readonly HoldingTrade[]): number {
  let net = 0;
  for (const transaction of transactions) {
    const microShares = toMicroShares(finite(transaction.shares));
    if (microShares <= 0) continue;
    if (transaction.type === 'buy') net += microShares;
    else if (transaction.type === 'sell') net -= microShares;
  }
  return fromMicroShares(Math.max(0, net));
}

/**
 * A holding's market value: shares × the unrounded price per share, rounded to cents once. A
 * negative share count counts as none.
 */
export function holdingValue(shares: number, unitPrice: number): number {
  return fromCents(toCents(Math.max(0, finite(shares)) * finite(unitPrice))) || 0;
}
