import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PropertyTransaction } from '@quro/shared';
import { normalizePropertyTransaction } from '../utils/normalizers';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useUpdatePropertyTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...transaction }: PropertyTransaction) => {
      const { data } = await api.patch(`/api/investments/property-transactions/${id}`, transaction);
      return normalizePropertyTransaction(data.data as PropertyTransaction);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
