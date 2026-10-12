import { useMemo } from 'react';
import {
  computeHoldingPosition,
  holdingValue,
  monthStartUtc,
  sumMoney,
  toUtcTimestamp,
  type Holding,
  type HoldingTransaction,
  type Mortgage,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';
import type {
  ConvertToBaseFn,
  InvestmentFormatFn,
  InvestmentPortfolioStats,
  InvestmentStatTrends,
} from '../types';
import { getPropertyMortgageBalance, getPropertyOwnershipShare } from '../utils/position';

type DatedHoldingTransaction = HoldingTransaction & { timestamp: number };
type DatedPropertyTransaction = PropertyTransaction & { timestamp: number };
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

function sumDividendsYearToDate(
  txns: readonly DatedHoldingTransaction[],
  yearStart: number,
  nowTs: number,
): number {
  return sumMoney(
    txns
      .filter(
        (txn) => txn.type === 'dividend' && txn.timestamp >= yearStart && txn.timestamp <= nowTs,
      )
      .map((txn) => txn.price),
  );
}

function computeHoldingTrendSnapshot(
  holdings: Holding[],
  holdingTxnMap: Map<number, DatedHoldingTransaction[]>,
  monthStart: number,
  yearStart: number,
  nowTs: number,
  convertToBase: ConvertToBaseFn,
): HoldingTrendSnapshot {
  const atMonthStart = holdings.map((holding) => {
    const txns = holdingTxnMap.get(holding.id) ?? [];
    // The shared position rule over the trades before the month started.
    const position = computeHoldingPosition(txns.filter((txn) => txn.timestamp < monthStart));
    const price = position.lastTradePrice ?? holding.currentPrice;
    return {
      value: convertToBase(holdingValue(position.shares, price), holding.currency),
      cost: convertToBase(position.costBasis, holding.currency),
      dividends: convertToBase(sumDividendsYearToDate(txns, yearStart, nowTs), holding.currency),
    };
  });

  return {
    brokerageAtMonthStartBase: sumMoney(atMonthStart.map((holding) => holding.value)),
    costAtMonthStartBase: sumMoney(atMonthStart.map((holding) => holding.cost)),
    dividendsYearToDateBase: sumMoney(atMonthStart.map((holding) => holding.dividends)),
  };
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

  return convertToBase((value - mortgage) * getPropertyOwnershipShare(property), property.currency);
}

function computePropertyEquityAtMonthStartBase(
  properties: Property[],
  propertyTxnMap: Map<number, DatedPropertyTransaction[]>,
  monthStart: number,
  mortgageById: Map<number, Mortgage>,
  convertToBase: ConvertToBaseFn,
): number {
  return sumMoney(
    properties.map((property) =>
      computePropertyEquityAtMonthStart(
        property,
        propertyTxnMap.get(property.id) ?? [],
        monthStart,
        mortgageById,
        convertToBase,
      ),
    ),
  );
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

    const brokerageDeltaThisMonth = sumMoney([
      stats.totalBrokerageBase,
      -brokerageAtMonthStartBase,
    ]);
    const unrealizedAtMonthStartBase = sumMoney([brokerageAtMonthStartBase, -costAtMonthStartBase]);
    const unrealizedDeltaThisMonth = sumMoney([stats.totalGainBase, -unrealizedAtMonthStartBase]);
    const propertyEquityDeltaThisMonth = sumMoney([
      stats.totalPropertyEquityBase,
      -propertyEquityAtMonthStartBase,
    ]);

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
