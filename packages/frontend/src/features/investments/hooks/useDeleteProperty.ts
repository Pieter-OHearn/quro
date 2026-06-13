import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export type DeletePropertyMode = 'preserveTransactions' | 'deleteTransactions';

type DeletePropertyInput = {
  id: number;
  mode?: DeletePropertyMode;
};

export function useDeleteProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, mode = 'preserveTransactions' }: DeletePropertyInput) => {
      await api.delete(`/api/investments/properties/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}

export function useUnarchiveProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/api/investments/properties/${id}/unarchive`);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
