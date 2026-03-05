import { useMemo } from 'react';
import type {
  Holding,
  HoldingTransaction,
  Mortgage,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import type {
  ConvertToBaseFn,
  InvestmentFormatFn,
  InvestmentPortfolioStats,
  InvestmentStatTrends,
} from '../types';
import { getPropertyMortgageBalance, monthStartUtc, toUtcTimestamp } from '../utils/position';

type DatedHoldingTransaction = HoldingTransaction & { timestamp: number };
type DatedPropertyTransaction = PropertyTransaction & { timestamp: number };
type HoldingTrendAccumulator = {
  sharesAtMonthStart: number;
  totalCostAtMonthStart: number;
  priceAtMonthStart: number | null;
  dividendsYearToDate: number;
};
type HoldingTrendSnapshot = {
  brokerageAtMonthStartBase: number;
  costAtMonthStartBase: number;
  dividendsYearToDateBase: number;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSignedCurrency(value: number, fmtBase: InvestmentFormatFn): string {
  const abs = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${fmtBase(abs, undefined, true)}`;
}

function mapHoldingTransactions(
  holdingTxns: HoldingTransaction[],
): Map<number, DatedHoldingTransaction[]> {
  const byHolding = new Map<number, DatedHoldingTransaction[]>();
  for (const txn of holdingTxns) {
    const timestamp = toUtcTimestamp(txn.date);
    if (!Number.isFinite(timestamp)) continue;
    const entry = { ...txn, timestamp };
    const bucket = byHolding.get(txn.holdingId);
    if (bucket) bucket.push(entry);
    else byHolding.set(txn.holdingId, [entry]);
  }
  for (const bucket of byHolding.values()) {
    bucket.sort((a, b) => a.timestamp - b.timestamp);
  }
  return byHolding;
}

function mapPropertyTransactions(
  propertyTxns: PropertyTransaction[],
): Map<number, DatedPropertyTransaction[]> {
  const byProperty = new Map<number, DatedPropertyTransaction[]>();
  for (const txn of propertyTxns) {
    const timestamp = toUtcTimestamp(txn.date);
    if (!Number.isFinite(timestamp)) continue;
    const entry = { ...txn, timestamp };
    const bucket = byProperty.get(txn.propertyId);
    if (bucket) bucket.push(entry);
    else byProperty.set(txn.propertyId, [entry]);
  }
  for (const bucket of byProperty.values()) {
    bucket.sort((a, b) => a.timestamp - b.timestamp);
  }
  return byProperty;
}

function addDividendIfYearToDate(
  state: HoldingTrendAccumulator,
  txn: DatedHoldingTransaction,
  yearStart: number,
  nowTs: number,
): void {
  if (txn.type !== 'dividend') return;
  if (txn.timestamp < yearStart || txn.timestamp > nowTs) return;
  state.dividendsYearToDate += txn.price;
}

function applyHoldingTxnBeforeMonthStart(
  state: HoldingTrendAccumulator,
  txn: DatedHoldingTransaction,
  monthStart: number,
): void {
  if (txn.type === 'dividend' || txn.timestamp >= monthStart) return;
  const txnShares = Number(txn.shares ?? 0);
  if (txnShares <= 0) return;

  if (txn.type === 'buy') {
    state.totalCostAtMonthStart += txnShares * txn.price;
    state.sharesAtMonthStart += txnShares;
    state.priceAtMonthStart = txn.price;
    return;
  }
  if (txn.type !== 'sell') return;

  const avgCostNow =
    state.sharesAtMonthStart > 0 ? state.totalCostAtMonthStart / state.sharesAtMonthStart : 0;
  state.totalCostAtMonthStart -= txnShares * avgCostNow;
  state.sharesAtMonthStart = Math.max(0, state.sharesAtMonthStart - txnShares);
  state.priceAtMonthStart = txn.price;
}

function computeHoldingAccumulator(
  txns: DatedHoldingTransaction[],
  monthStart: number,
  yearStart: number,
  nowTs: number,
): HoldingTrendAccumulator {
  const state: HoldingTrendAccumulator = {
    sharesAtMonthStart: 0,
    totalCostAtMonthStart: 0,
    priceAtMonthStart: null,
    dividendsYearToDate: 0,
  };
  for (const txn of txns) {
    addDividendIfYearToDate(state, txn, yearStart, nowTs);
    applyHoldingTxnBeforeMonthStart(state, txn, monthStart);
  }
  return state;
}

function computeHoldingTrendSnapshot(
  holdings: Holding[],
  holdingTxnMap: Map<number, DatedHoldingTransaction[]>,
  monthStart: number,
  yearStart: number,
  nowTs: number,
  convertToBase: ConvertToBaseFn,
): HoldingTrendSnapshot {
  let brokerageAtMonthStartBase = 0;
  let costAtMonthStartBase = 0;
  let dividendsYearToDateBase = 0;

  for (const holding of holdings) {
    const txns = holdingTxnMap.get(holding.id) ?? [];
    const state = computeHoldingAccumulator(txns, monthStart, yearStart, nowTs);
    const avgCostAtMonthStart =
      state.sharesAtMonthStart > 0 ? state.totalCostAtMonthStart / state.sharesAtMonthStart : 0;
    const valuationPriceAtMonthStart = state.priceAtMonthStart ?? holding.currentPrice;

    brokerageAtMonthStartBase += convertToBase(
      state.sharesAtMonthStart * valuationPriceAtMonthStart,
      holding.currency,
    );
    costAtMonthStartBase += convertToBase(
      state.sharesAtMonthStart * avgCostAtMonthStart,
      holding.currency,
    );
    dividendsYearToDateBase += convertToBase(state.dividendsYearToDate, holding.currency);
  }

  return { brokerageAtMonthStartBase, costAtMonthStartBase, dividendsYearToDateBase };
}

function computePropertyEquityAtMonthStart(
  property: Property,
  txns: DatedPropertyTransaction[],
  monthStart: number,
  mortgageById: Map<number, Mortgage>,
  convertToBase: ConvertToBaseFn,
): number {
  const hasValuationTxn = txns.some((txn) => txn.type === 'valuation');
  let value = hasValuationTxn ? property.purchasePrice : property.currentValue;
  for (const txn of txns) {
    if (txn.timestamp >= monthStart) break;
    if (txn.type === 'valuation') value = txn.amount;
  }

  let mortgage = getPropertyMortgageBalance(property, mortgageById);
  for (const txn of txns) {
    if (txn.timestamp < monthStart || txn.type !== 'repayment') continue;
    const principal = txn.principal ?? Math.max(0, txn.amount - (txn.interest ?? 0));
    mortgage += principal;
  }

  return convertToBase(value - mortgage, property.currency);
}

function computePropertyEquityAtMonthStartBase(
  properties: Property[],
  propertyTxnMap: Map<number, DatedPropertyTransaction[]>,
  monthStart: number,
  mortgageById: Map<number, Mortgage>,
  convertToBase: ConvertToBaseFn,
): number {
  return properties.reduce((sum, property) => {
    const txns = propertyTxnMap.get(property.id) ?? [];
    return (
      sum +
      computePropertyEquityAtMonthStart(property, txns, monthStart, mortgageById, convertToBase)
    );
  }, 0);
}

export function useInvestmentStatTrends(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
  properties: Property[],
  propertyTxns: PropertyTransaction[],
  mortgageById: Map<number, Mortgage>,
  convertToBase: ConvertToBaseFn,
  stats: InvestmentPortfolioStats,
  fmtBase: InvestmentFormatFn,
): InvestmentStatTrends {
  return useMemo(() => {
    const nowTs = Date.now();
    const monthStart = monthStartUtc(nowTs);
    const now = new Date(nowTs);
    const yearStart = Date.UTC(now.getUTCFullYear(), 0, 1);

    const holdingTxnMap = mapHoldingTransactions(holdingTxns);
    const propertyTxnMap = mapPropertyTransactions(propertyTxns);
    const { brokerageAtMonthStartBase, costAtMonthStartBase, dividendsYearToDateBase } =
      computeHoldingTrendSnapshot(
        holdings,
        holdingTxnMap,
        monthStart,
        yearStart,
        nowTs,
        convertToBase,
      );
    const propertyEquityAtMonthStartBase = computePropertyEquityAtMonthStartBase(
      properties,
      propertyTxnMap,
      monthStart,
      mortgageById,
      convertToBase,
    );

    const brokerageDeltaThisMonth = stats.totalBrokerageBase - brokerageAtMonthStartBase;
    const unrealizedAtMonthStartBase = brokerageAtMonthStartBase - costAtMonthStartBase;
    const unrealizedDeltaThisMonth = stats.totalGainBase - unrealizedAtMonthStartBase;
    const propertyEquityDeltaThisMonth =
      stats.totalPropertyEquityBase - propertyEquityAtMonthStartBase;

    const monthStartLabel = formatDate(monthStart);
    const todayLabel = formatDate(nowTs);
    const yearStartLabel = formatDate(yearStart);

    return {
      brokerageValue: {
        value: `${formatSignedCurrency(brokerageDeltaThisMonth, fmtBase)} MTD`,
        positive: brokerageDeltaThisMonth >= 0,
        details: `Month-to-date change (${monthStartLabel} to ${todayLabel}). Now ${fmtBase(stats.totalBrokerageBase)} vs ${fmtBase(brokerageAtMonthStartBase)} at month start.`,
      },
      unrealizedGain: {
        value: `${formatSignedCurrency(unrealizedDeltaThisMonth, fmtBase)} MTD`,
        positive: unrealizedDeltaThisMonth >= 0,
        details: `Month-to-date change (${monthStartLabel} to ${todayLabel}). Unrealized gain is market value minus cost basis: now ${fmtBase(stats.totalGainBase)} vs ${fmtBase(unrealizedAtMonthStartBase)} at month start.`,
      },
      dividendsReceived: {
        value: `${formatSignedCurrency(dividendsYearToDateBase, fmtBase)} YTD`,
        positive: dividendsYearToDateBase >= 0,
        details: `Year-to-date dividends (${yearStartLabel} to ${todayLabel}): ${fmtBase(dividendsYearToDateBase)}.`,
      },
      propertyEquity: {
        value: `${formatSignedCurrency(propertyEquityDeltaThisMonth, fmtBase)} MTD`,
        positive: propertyEquityDeltaThisMonth >= 0,
        details: `Month-to-date change (${monthStartLabel} to ${todayLabel}). Now ${fmtBase(stats.totalPropertyEquityBase)} vs ${fmtBase(propertyEquityAtMonthStartBase)} at month start.`,
      },
    };
  }, [
    holdings,
    holdingTxns,
    properties,
    propertyTxns,
    mortgageById,
    convertToBase,
    stats,
    fmtBase,
  ]);
}
