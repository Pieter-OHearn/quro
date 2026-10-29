import { useMemo } from 'react';
import {
  holdingValue,
  sumMoney,
  type Holding,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';
import type { ConvertToBaseFn, InvestmentPortfolioStats } from '../types';
import { computeTotalRental } from '../utils/portfolio';
import type { Position } from '../utils/position';

/** The investments page totals in the display currency. */
export function computeInvestmentPortfolioStats(
  holdings: readonly Holding[],
  positions: Readonly<Record<number, Position>>,
  properties: readonly Property[],
  propertyTxns: readonly PropertyTransaction[],
  convertToBase: ConvertToBaseFn,
): InvestmentPortfolioStats {
  // Totals are sums of cents, like the dashboard: each holding is worth its shares × its
  // unrounded current price, rounded once, and each row is converted before it is added.
  const sumHoldings = (amount: (holding: Holding, position: Position) => number) =>
    sumMoney(
      holdings.map((holding) =>
        convertToBase(amount(holding, positions[holding.id]), holding.currency),
      ),
    );
  const totalBrokerageBase = sumHoldings((holding, position) =>
    holdingValue(position.shares, holding.currentPrice),
  );
  const totalCostBase = sumHoldings((_, position) => position.costBasis);
  const totalDividendsBase = sumHoldings((_, position) => position.totalDividends);
  const totalRealizedBase = sumHoldings((_, position) => position.realizedGain);
  // Each property's equity is the server's figure, the one the dashboard sums.
  const totalPropertyEquityBase = sumMoney(
    properties.map((property) => convertToBase(property.equity, property.currency)),
  );
  const totalRentalBase = computeTotalRental(propertyTxns, properties, convertToBase);
  const totalGainBase = sumMoney([totalBrokerageBase, -totalCostBase]);

  return {
    totalBrokerageBase,
    totalCostBase,
    totalGainBase,
    gainPct: totalCostBase > 0 ? (totalGainBase / totalCostBase) * 100 : 0,
    totalDividendsBase,
    totalRealizedBase,
    totalPropertyEquityBase,
    totalRentalBase,
  };
}

export function useInvestmentPortfolioStats(
  holdings: Holding[],
  positions: Record<number, Position>,
  properties: Property[],
  propertyTxns: PropertyTransaction[],
  convertToBase: ConvertToBaseFn,
): InvestmentPortfolioStats {
  return useMemo(
    () =>
      computeInvestmentPortfolioStats(holdings, positions, properties, propertyTxns, convertToBase),
    [holdings, positions, properties, propertyTxns, convertToBase],
  );
}
