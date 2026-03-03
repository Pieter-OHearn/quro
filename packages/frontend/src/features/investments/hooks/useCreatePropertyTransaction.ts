import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PropertyTransaction } from '@quro/shared';
import { normalizePropertyTransaction } from '../utils/normalizers';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useCreatePropertyTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transaction: Omit<PropertyTransaction, 'id'>) => {
      const { data } = await api.post('/api/investments/property-transactions', transaction);
      return normalizePropertyTransaction(data.data as PropertyTransaction);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
