import {
  addMonthsUtc,
  computeHoldingPosition,
  EMPTY_HOLDING_POSITION,
  holdingValue,
  monthEndUtc,
  monthStartUtc,
  sumMoney,
  toUtcTimestamp,
  type Holding,
  type HoldingPriceHistoryEntry,
  type HoldingTransaction,
  type Mortgage,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';
import {
  formatMonthLabel,
  getPropertyMortgageBalance,
  getPropertyOwnershipShare,
  type DatedHoldingTransaction,
  type DatedPropertyTransaction,
  type Position,
} from './position';

export const EMPTY_POSITION: Position = EMPTY_HOLDING_POSITION;

type DatedHoldingPriceHistoryEntry = HoldingPriceHistoryEntry & { timestamp: number };
const BINARY_SEARCH_DIVISOR = 2;
const VISIBLE_MONTH_COUNT = 12;
const DATE_MONTH_SLICE_LENGTH = 7;

function buildHoldingTxnMap(datedHoldingTxns: DatedHoldingTransaction[]) {
  const map = new Map<number, DatedHoldingTransaction[]>();
  for (const transaction of datedHoldingTxns) {
    const bucket = map.get(transaction.holdingId);
    if (bucket) bucket.push(transaction);
    else map.set(transaction.holdingId, [transaction]);
  }
  for (const txns of map.values()) {
    txns.sort((a, b) => a.timestamp - b.timestamp);
  }
  return map;
}

function buildPropertyTxnMap(datedPropertyTxns: DatedPropertyTransaction[]) {
  const map = new Map<number, DatedPropertyTransaction[]>();
  for (const transaction of datedPropertyTxns) {
    const bucket = map.get(transaction.propertyId);
    if (bucket) bucket.push(transaction);
    else map.set(transaction.propertyId, [transaction]);
  }
  for (const txns of map.values()) {
    txns.sort((a, b) => a.timestamp - b.timestamp);
  }
  return map;
}

function buildHoldingPriceMap(datedHoldingPrices: DatedHoldingPriceHistoryEntry[]) {
  const map = new Map<number, DatedHoldingPriceHistoryEntry[]>();
  for (const pricePoint of datedHoldingPrices) {
    const bucket = map.get(pricePoint.holdingId);
    if (bucket) bucket.push(pricePoint);
    else map.set(pricePoint.holdingId, [pricePoint]);
  }
  for (const prices of map.values()) {
    prices.sort((left, right) => left.timestamp - right.timestamp);
  }
  return map;
}

// The shared position rule over the trades up to the cutoff (dividends never move shares).
function computeHoldingStateAtCutoff(txns: DatedHoldingTransaction[], cutoff: number): Position {
  return computeHoldingPosition(txns.filter((transaction) => transaction.timestamp <= cutoff));
}

function resolveHoldingMarketPrice(
  pricePoints: DatedHoldingPriceHistoryEntry[],
  cutoff: number,
): number | null {
  let low = 0;
  let high = pricePoints.length - 1;
  let candidate = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / BINARY_SEARCH_DIVISOR);
    if (pricePoints[mid].timestamp <= cutoff) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (candidate < 0) return null;
  const close = Number(pricePoints[candidate].closePrice);
  return Number.isFinite(close) ? close : null;
}

function computeBrokerageForMonth(
  holdings: Holding[],
  holdingTxnMap: Map<number, DatedHoldingTransaction[]>,
  holdingPriceMap: Map<number, DatedHoldingPriceHistoryEntry[]>,
  cutoff: number,
  convertToBase: (value: number, currency: string) => number,
) {
  let isEstimated = false;
  const brokerage = sumMoney(
    holdings.map((holding) => {
      const txns = holdingTxnMap.get(holding.id) ?? [];
      const state = computeHoldingStateAtCutoff(txns, cutoff);
      const marketPrice = resolveHoldingMarketPrice(holdingPriceMap.get(holding.id) ?? [], cutoff);
      const resolvedPrice =
        marketPrice ?? state.lastTradePrice ?? (state.avgCost > 0 ? state.avgCost : 0);
      if (marketPrice === null && state.shares > 0) isEstimated = true;
      return convertToBase(holdingValue(state.shares, resolvedPrice), holding.currency);
    }),
  );
  return { brokerage, isEstimated };
}

function getPropertyEquity(
  property: Property,
  txns: DatedPropertyTransaction[],
  cutoff: number,
  mortgageById: Map<number, Mortgage>,
  convertToBase: (value: number, currency: string) => number,
): number {
  const hasValuationTxn = txns.some((t) => t.type === 'valuation');
  let value = hasValuationTxn ? property.purchasePrice : property.currentValue;
  for (const t of txns) {
    if (t.timestamp > cutoff) break;
    if (t.type === 'valuation') value = t.amount;
  }
  let mortgage = getPropertyMortgageBalance(property, mortgageById);
  for (const t of txns) {
    if (t.timestamp <= cutoff || t.type !== 'repayment') continue;
    const principal = t.principal ?? Math.max(0, t.amount - (t.interest ?? 0));
    mortgage += principal;
  }
  return convertToBase((value - mortgage) * getPropertyOwnershipShare(property), property.currency);
}

function computePropertyEquityForMonth(
  properties: Property[],
  propertyTxnMap: Map<number, DatedPropertyTransaction[]>,
  cutoff: number,
  mortgageById: Map<number, Mortgage>,
  convertToBase: (value: number, currency: string) => number,
) {
  return sumMoney(
    properties.map((property) =>
      getPropertyEquity(
        property,
        propertyTxnMap.get(property.id) ?? [],
        cutoff,
        mortgageById,
        convertToBase,
      ),
    ),
  );
}

export function computePortfolioHistory(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
  holdingPriceHistory: HoldingPriceHistoryEntry[],
  properties: Property[],
  propertyTxns: PropertyTransaction[],
  mortgageById: Map<number, Mortgage>,
  convertToBase: (value: number, currency: string) => number,
) {
  const datedHoldingTxns: DatedHoldingTransaction[] = holdingTxns
    .map((transaction) => ({ ...transaction, timestamp: toUtcTimestamp(transaction.date) }))
    .filter((transaction) => Number.isFinite(transaction.timestamp));
  const datedPropertyTxns: DatedPropertyTransaction[] = propertyTxns
    .map((transaction) => ({ ...transaction, timestamp: toUtcTimestamp(transaction.date) }))
    .filter((transaction) => Number.isFinite(transaction.timestamp));
  const datedHoldingPrices: DatedHoldingPriceHistoryEntry[] = holdingPriceHistory
    .map((pricePoint) => ({ ...pricePoint, timestamp: toUtcTimestamp(pricePoint.eodDate) }))
    .filter((pricePoint) => Number.isFinite(pricePoint.timestamp));

  const allTimestamps = [
    ...datedHoldingTxns.map((transaction) => transaction.timestamp),
    ...datedPropertyTxns.map((transaction) => transaction.timestamp),
  ];

  if (allTimestamps.length === 0) return [];

  const currentMonthStart = monthStartUtc(Date.now());
  const earliestMonth = monthStartUtc(Math.min(...allTimestamps));
  const oldestVisibleMonth = addMonthsUtc(currentMonthStart, -(VISIBLE_MONTH_COUNT - 1));
  const firstMonth = Math.max(earliestMonth, oldestVisibleMonth);

  const holdingTxnMap = buildHoldingTxnMap(datedHoldingTxns);
  const holdingPriceMap = buildHoldingPriceMap(datedHoldingPrices);
  const propertyTxnMap = buildPropertyTxnMap(datedPropertyTxns);

  const months: number[] = [];
  for (let month = firstMonth; month <= currentMonthStart; month = addMonthsUtc(month, 1)) {
    months.push(month);
  }

  return months.map((month) => {
    const cutoff = monthEndUtc(month);
    const brokerageResult = computeBrokerageForMonth(
      holdings,
      holdingTxnMap,
      holdingPriceMap,
      cutoff,
      convertToBase,
    );
    const propertyEquity = computePropertyEquityForMonth(
      properties,
      propertyTxnMap,
      cutoff,
      mortgageById,
      convertToBase,
    );
    return {
      month: formatMonthLabel(month),
      brokerage: brokerageResult.brokerage,
      propertyEquity,
      isEstimated: brokerageResult.isEstimated,
    };
  });
}

export function computeTotalRental(
  propertyTxns: readonly PropertyTransaction[],
  properties: readonly Property[],
  convertToBase: (value: number, currency: string) => number,
) {
  const currentMonth = new Date().toISOString().slice(0, DATE_MONTH_SLICE_LENGTH);
  const rentalTxns = propertyTxns.filter(
    (transaction) =>
      transaction.type === 'rent_income' && transaction.date.startsWith(currentMonth),
  );

  if (rentalTxns.length === 0) {
    return sumMoney(
      properties.map((property) =>
        convertToBase(
          property.monthlyRent * getPropertyOwnershipShare(property),
          property.currency,
        ),
      ),
    );
  }

  const propertyById = new Map(properties.map((property) => [property.id, property]));
  return sumMoney(
    rentalTxns.map((transaction) => {
      const property = propertyById.get(transaction.propertyId);
      const ownershipShare = property ? getPropertyOwnershipShare(property) : 1;
      return convertToBase(transaction.amount * ownershipShare, property?.currency ?? 'EUR');
    }),
  );
}
