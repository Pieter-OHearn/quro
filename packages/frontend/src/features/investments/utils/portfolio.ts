import type {
  Holding,
  HoldingTransaction,
  Mortgage,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import {
  addMonthsUtc,
  formatMonthLabel,
  getPropertyMortgageBalance,
  monthEndUtc,
  monthStartUtc,
  toUtcTimestamp,
  type DatedHoldingTransaction,
  type DatedPropertyTransaction,
  type Position,
} from './position';

export const EMPTY_POSITION: Position = {
  shares: 0,
  avgCost: 0,
  realizedGain: 0,
  totalDividends: 0,
};

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

function computeBrokerageForMonth(
  holdings: Holding[],
  holdingTxnMap: Map<number, DatedHoldingTransaction[]>,
  cutoff: number,
  convertToBase: (value: number, currency: string) => number,
) {
  return holdings.reduce((sum, holding) => {
    const txns = holdingTxnMap.get(holding.id) ?? [];
    let shares = 0;
    let dividends = 0;

    for (const transaction of txns) {
      if (transaction.timestamp > cutoff) break;
      const txnShares = Number(transaction.shares ?? 0);
      if (transaction.type === 'buy' && txnShares > 0) {
        shares += txnShares;
      } else if (transaction.type === 'sell' && txnShares > 0) {
        shares = Math.max(0, shares - txnShares);
      } else if (transaction.type === 'dividend') {
        dividends += transaction.price;
      }
    }

    const nativeValue = Math.max(0, shares) * holding.currentPrice + dividends;
    return sum + convertToBase(nativeValue, holding.currency);
  }, 0);
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
  return convertToBase(value - mortgage, property.currency);
}

function computePropertyEquityForMonth(
  properties: Property[],
  propertyTxnMap: Map<number, DatedPropertyTransaction[]>,
  cutoff: number,
  mortgageById: Map<number, Mortgage>,
  convertToBase: (value: number, currency: string) => number,
) {
  return properties.reduce(
    (sum, property) =>
      sum +
      getPropertyEquity(
        property,
        propertyTxnMap.get(property.id) ?? [],
        cutoff,
        mortgageById,
        convertToBase,
      ),
    0,
  );
}

export function computePortfolioHistory(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
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

  const allTimestamps = [
    ...datedHoldingTxns.map((transaction) => transaction.timestamp),
    ...datedPropertyTxns.map((transaction) => transaction.timestamp),
  ];

  if (allTimestamps.length === 0) return [];

  const currentMonthStart = monthStartUtc(Date.now());
  const earliestMonth = monthStartUtc(Math.min(...allTimestamps));
  const oldestVisibleMonth = addMonthsUtc(currentMonthStart, -11);
  const firstMonth = Math.max(earliestMonth, oldestVisibleMonth);

  const holdingTxnMap = buildHoldingTxnMap(datedHoldingTxns);
  const propertyTxnMap = buildPropertyTxnMap(datedPropertyTxns);

  const months: number[] = [];
  for (let month = firstMonth; month <= currentMonthStart; month = addMonthsUtc(month, 1)) {
    months.push(month);
  }

  return months.map((month) => {
    const cutoff = monthEndUtc(month);
    const brokerage = computeBrokerageForMonth(holdings, holdingTxnMap, cutoff, convertToBase);
    const propertyEquity = computePropertyEquityForMonth(
      properties,
      propertyTxnMap,
      cutoff,
      mortgageById,
      convertToBase,
    );
    return { month: formatMonthLabel(month), brokerage, propertyEquity };
  });
}

export function computeTotalRental(
  propertyTxns: PropertyTransaction[],
  properties: Property[],
  convertToBase: (value: number, currency: string) => number,
) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const rentalTxns = propertyTxns.filter(
    (transaction) =>
      transaction.type === 'rent_income' && transaction.date.startsWith(currentMonth),
  );

  if (rentalTxns.length === 0) {
    return properties.reduce(
      (sum, property) => sum + convertToBase(property.monthlyRent, property.currency),
      0,
    );
  }

  const propertyById = new Map(properties.map((property) => [property.id, property]));
  return rentalTxns.reduce((sum, transaction) => {
    const property = propertyById.get(transaction.propertyId);
    return sum + convertToBase(transaction.amount, property?.currency ?? 'EUR');
  }, 0);
}
