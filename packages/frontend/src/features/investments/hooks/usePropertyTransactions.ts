import { queryKeys } from '@/lib/queryKeys';
import { apiGetAllPages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { PropertyTransaction } from '@quro/shared';

export function usePropertyTransactions(propertyId?: number) {
  return useQuery({
    queryKey: queryKeys.investments.propertyTransactionList(propertyId),
    queryFn: async ({ signal }) => {
      const params = propertyId ? { propertyId } : {};
      return apiGetAllPages<PropertyTransaction>('/api/investments/property-transactions', {
        params,
        signal,
      });
    },
  });
}
