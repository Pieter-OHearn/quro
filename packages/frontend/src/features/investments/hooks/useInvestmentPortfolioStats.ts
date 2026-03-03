import { useMemo } from 'react';
import type { Holding, Mortgage, Property, PropertyTransaction } from '@quro/shared';
import type { ConvertToBaseFn, InvestmentPortfolioStats } from '../types';
import { computeTotalRental } from '../utils/portfolio';
import { getPropertyMortgageBalance, type Position } from '../utils/position';

export function useInvestmentPortfolioStats(
  holdings: Holding[],
  positions: Record<number, Position>,
  properties: Property[],
  propertyTxns: PropertyTransaction[],
  mortgageById: Map<number, Mortgage>,
  convertToBase: ConvertToBaseFn,
): InvestmentPortfolioStats {
  return useMemo(() => {
    const totalBrokerageBase = holdings.reduce(
      (sum, holding) =>
        sum + convertToBase(positions[holding.id].shares * holding.currentPrice, holding.currency),
      0,
    );
    const totalCostBase = holdings.reduce(
      (sum, holding) =>
        sum +
        convertToBase(
          positions[holding.id].shares * positions[holding.id].avgCost,
          holding.currency,
        ),
      0,
    );
    const totalDividendsBase = holdings.reduce(
      (sum, holding) => sum + convertToBase(positions[holding.id].totalDividends, holding.currency),
      0,
    );
    const totalRealizedBase = holdings.reduce(
      (sum, holding) => sum + convertToBase(positions[holding.id].realizedGain, holding.currency),
      0,
    );
    const totalPropertyEquityBase = properties.reduce(
      (sum, property) =>
        sum +
        convertToBase(
          property.currentValue - getPropertyMortgageBalance(property, mortgageById),
          property.currency,
        ),
      0,
    );
    const totalRentalBase = computeTotalRental(propertyTxns, properties, convertToBase);
    const totalGainBase = totalBrokerageBase - totalCostBase;

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
  }, [holdings, positions, properties, propertyTxns, mortgageById, convertToBase]);
}
