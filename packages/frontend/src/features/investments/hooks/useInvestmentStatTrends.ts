import { useMemo } from 'react';
import {
  computeHoldingPosition,
  holdingValue,
  monthStartUtc,
  sumMoney,
  toUtcTimestamp,
  type Holding,
  type HoldingTransaction,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';
import type {
  ConvertToBaseFn,
  InvestmentFormatFn,
  InvestmentPortfolioStats,
  InvestmentStatTrends,
} from '../types';
import { propertyEquityAt } from '../utils/position';
import type { PropertyDebts } from '../utils/portfolio';

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

// The equity just before this month: records dated this month are left out.
function computePropertyEquityAtMonthStartBase(
  properties: Property[],
  propertyTxnMap: Map<number, DatedPropertyTransaction[]>,
  monthStart: number,
  debts: PropertyDebts,
  convertToBase: ConvertToBaseFn,
): number {
  return sumMoney(
    properties.map((property) =>
      convertToBase(
        propertyEquityAt(
          property,
          propertyTxnMap.get(property.id) ?? [],
          debts.repaymentsByMortgage.get(property.mortgageId ?? -1) ?? [],
          property.mortgageId == null ? undefined : debts.mortgageById.get(property.mortgageId),
          monthStart - 1,
        ),
        property.currency,
      ),
    ),
  );
}

export function useInvestmentStatTrends(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
  properties: Property[],
  propertyTxns: PropertyTransaction[],
  debts: PropertyDebts,
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
      debts,
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
        amount: brokerageDeltaThisMonth,
        label: 'MTD',
        details: `Month-to-date change (${monthStartLabel} to ${todayLabel}). Now ${fmtBase(stats.totalBrokerageBase)} vs ${fmtBase(brokerageAtMonthStartBase)} at month start.`,
      },
      unrealizedGain: {
        amount: unrealizedDeltaThisMonth,
        label: 'MTD',
        details: `Month-to-date change (${monthStartLabel} to ${todayLabel}). Unrealized gain is market value minus cost basis: now ${fmtBase(stats.totalGainBase)} vs ${fmtBase(unrealizedAtMonthStartBase)} at month start.`,
      },
      dividendsReceived: {
        amount: dividendsYearToDateBase,
        label: 'YTD',
        details: `Year-to-date dividends (${yearStartLabel} to ${todayLabel}): ${fmtBase(dividendsYearToDateBase)}.`,
      },
      propertyEquity: {
        amount: propertyEquityDeltaThisMonth,
        label: 'MTD',
        details: `Month-to-date change (${monthStartLabel} to ${todayLabel}). Now ${fmtBase(stats.totalPropertyEquityBase)} vs ${fmtBase(propertyEquityAtMonthStartBase)} at month start.`,
      },
    };
  }, [holdings, holdingTxns, properties, propertyTxns, debts, convertToBase, stats, fmtBase]);
}
