import { useMemo } from 'react';
import type {
  Holding,
  HoldingPriceHistoryEntry,
  HoldingTransaction,
  Mortgage,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import type { ConvertToBaseFn, PortfolioHistoryPoint } from '../types';
import { computePortfolioHistory } from '../utils/portfolio';

export function usePortfolioHistory(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
  holdingPriceHistory: HoldingPriceHistoryEntry[],
  properties: Property[],
  propertyTxns: PropertyTransaction[],
  mortgageById: Map<number, Mortgage>,
  convertToBase: ConvertToBaseFn,
): PortfolioHistoryPoint[] {
  return useMemo(
    () =>
      computePortfolioHistory(
        holdings,
        holdingTxns,
        holdingPriceHistory,
        properties,
        propertyTxns,
        mortgageById,
        convertToBase,
      ),
    [
      holdings,
      holdingTxns,
      holdingPriceHistory,
      properties,
      propertyTxns,
      mortgageById,
      convertToBase,
    ],
  );
}
