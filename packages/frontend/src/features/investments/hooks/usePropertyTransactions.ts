import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { PropertyTransaction } from '@quro/shared';

export function usePropertyTransactions(propertyId?: number) {
  return useQuery({
    queryKey: queryKeys.investments.propertyTransactionList(propertyId),
    queryFn: async () => {
      const params = propertyId ? { propertyId } : {};
      return apiGet<PropertyTransaction[]>('/api/investments/property-transactions', { params });
    },
  });
}
