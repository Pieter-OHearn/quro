import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';

export type DeletePensionPotMode = 'preserveTransactions' | 'deleteTransactions';

type DeletePensionPotInput = {
  id: number;
  mode?: DeletePensionPotMode;
};

export function useDeletePensionPot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, mode = 'preserveTransactions' }: DeletePensionPotInput) => {
      await api.delete(`/api/pensions/pots/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}

export function useUnarchivePensionPot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/api/pensions/pots/${id}/unarchive`);
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}
