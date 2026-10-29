import { useMemo } from 'react';
import type {
  Holding,
  HoldingPriceHistoryEntry,
  HoldingTransaction,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import type { ConvertToBaseFn, PortfolioHistoryPoint } from '../types';
import { computePortfolioHistory, type PropertyDebts } from '../utils/portfolio';

export function usePortfolioHistory(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
  holdingPriceHistory: HoldingPriceHistoryEntry[],
  properties: Property[],
  propertyTxns: PropertyTransaction[],
  debts: PropertyDebts,
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
        debts,
        convertToBase,
      ),
    [holdings, holdingTxns, holdingPriceHistory, properties, propertyTxns, debts, convertToBase],
  );
}
