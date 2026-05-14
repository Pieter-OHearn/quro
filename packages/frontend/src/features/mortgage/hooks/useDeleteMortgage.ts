import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DeleteMortgageMode = 'preserveTransactions' | 'deleteTransactions';

type DeleteMortgageInput = {
  id: number;
  mode?: DeleteMortgageMode;
};

function invalidateMortgageQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['mortgages'] });
  void qc.invalidateQueries({ queryKey: ['investments'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useDeleteMortgage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, mode = 'preserveTransactions' }: DeleteMortgageInput) => {
      await api.delete(`/api/mortgages/${id}`, {
        params: mode === 'deleteTransactions' ? { cascade: true } : undefined,
      });
    },
    onSuccess: () => {
      invalidateMortgageQueries(qc);
    },
  });
}

export function useUnarchiveMortgage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/api/mortgages/${id}/unarchive`);
    },
    onSuccess: () => {
      invalidateMortgageQueries(qc);
    },
  });
}
