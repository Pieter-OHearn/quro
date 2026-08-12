import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DeleteSavingsAccountMode } from '../types';

type DeleteSavingsAccountInput = {
  id: number;
  mode: DeleteSavingsAccountMode;
};

function invalidateSavings(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['savings'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
  void qc.invalidateQueries({ queryKey: ['plan'] });
}

export function useDeleteSavingsAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, mode }: DeleteSavingsAccountInput) => {
      await api.delete(`/api/savings/accounts/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
    onSuccess: () => invalidateSavings(queryClient),
  });
}

export function useUnarchiveSavingsAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/api/savings/accounts/${id}/unarchive`);
    },
    onSuccess: () => invalidateSavings(queryClient),
  });
}
