import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useDeleteHoldingTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/investments/holding-transactions/${id}`);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
