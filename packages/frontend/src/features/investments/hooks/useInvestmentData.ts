import { useMortgages } from '../../mortgage/hooks';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import type { InvestmentData } from '../types';
import { useHoldings } from './useHoldings';
import { useHoldingTransactions } from './useHoldingTransactions';
import { useProperties } from './useProperties';
import { usePropertyTransactions } from './usePropertyTransactions';

export function useInvestmentData(): InvestmentData {
  const holdingsQuery = useHoldings();
  const holdingTransactionsQuery = useHoldingTransactions();
  const propertiesQuery = useProperties();
  const propertyTransactionsQuery = usePropertyTransactions();
  const mortgagesQuery = useMortgages();

  return {
    holdings: holdingsQuery.data ?? [],
    holdingTxns: holdingTransactionsQuery.data ?? [],
    properties: propertiesQuery.data ?? [],
    propertyTxns: propertyTransactionsQuery.data ?? [],
    mortgages: mortgagesQuery.data ?? [],
    isLoading:
      holdingsQuery.isLoading ||
      holdingTransactionsQuery.isLoading ||
      propertiesQuery.isLoading ||
      propertyTransactionsQuery.isLoading ||
      mortgagesQuery.isLoading,
    queryFailures: getFailedRouteQueries([
      { label: 'holdings', ...holdingsQuery },
      { label: 'holding transactions', ...holdingTransactionsQuery },
      { label: 'properties', ...propertiesQuery },
      { label: 'property transactions', ...propertyTransactionsQuery },
      { label: 'mortgages', ...mortgagesQuery },
    ]),
  };
}
