import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export type DeleteHoldingMode = 'preserveTransactions' | 'deleteTransactions';

type DeleteHoldingInput = {
  id: number;
  mode?: DeleteHoldingMode;
};

export function useDeleteHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, mode = 'preserveTransactions' }: DeleteHoldingInput) => {
      await api.delete(`/api/investments/holdings/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}

export function useUnarchiveHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/api/investments/holdings/${id}/unarchive`);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
