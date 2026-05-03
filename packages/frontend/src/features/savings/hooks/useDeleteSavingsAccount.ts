import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DeleteSavingsAccountMode } from '../types';

type DeleteSavingsAccountInput = {
  id: number;
  mode: DeleteSavingsAccountMode;
};

export function useDeleteSavingsAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, mode }: DeleteSavingsAccountInput) => {
      await api.delete(`/api/savings/accounts/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['savings'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
