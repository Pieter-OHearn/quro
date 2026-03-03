import { useMemo } from 'react';
import type {
  Holding,
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
        properties,
        propertyTxns,
        mortgageById,
        convertToBase,
      ),
    [holdings, holdingTxns, properties, propertyTxns, mortgageById, convertToBase],
  );
}
