import { useMortgages } from '../../mortgage/hooks';
import type { InvestmentData } from '../types';
import { useHoldings } from './useHoldings';
import { useHoldingTransactions } from './useHoldingTransactions';
import { useProperties } from './useProperties';
import { usePropertyTransactions } from './usePropertyTransactions';

export function useInvestmentData(): InvestmentData {
  const { data: holdings = [], isLoading: loadingHoldings } = useHoldings();
  const { data: holdingTxns = [], isLoading: loadingHoldingTxns } = useHoldingTransactions();
  const { data: properties = [], isLoading: loadingProperties } = useProperties();
  const { data: propertyTxns = [], isLoading: loadingPropertyTxns } = usePropertyTransactions();
  const { data: mortgages = [], isLoading: loadingMortgages } = useMortgages();

  return {
    holdings,
    holdingTxns,
    properties,
    propertyTxns,
    mortgages,
    isLoading:
      loadingHoldings ||
      loadingHoldingTxns ||
      loadingProperties ||
      loadingPropertyTxns ||
      loadingMortgages,
  };
}
