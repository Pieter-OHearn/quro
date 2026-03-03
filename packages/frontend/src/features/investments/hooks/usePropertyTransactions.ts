import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PropertyTransaction } from '@quro/shared';
import { normalizePropertyTransaction } from '../utils/normalizers';

export function usePropertyTransactions(propertyId?: number) {
  return useQuery({
    queryKey: ['investments', 'propertyTransactions', propertyId],
    queryFn: async () => {
      const params = propertyId ? { propertyId } : {};
      const { data } = await api.get('/api/investments/property-transactions', { params });
      return (data.data as PropertyTransaction[]).map(normalizePropertyTransaction);
    },
  });
}
