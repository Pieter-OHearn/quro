import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DeleteDebtMode = 'preservePayments' | 'deletePayments';

type DeleteDebtInput = {
  id: number;
  mode?: DeleteDebtMode;
};

function invalidateDebtQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['debts'] });
  void qc.invalidateQueries({ queryKey: ['debts', 'payments'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useDeleteDebt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, mode = 'preservePayments' }: DeleteDebtInput) => {
      await api.delete(`/api/debts/${id}`, {
        params: mode === 'deletePayments' ? { cascade: true } : undefined,
      });
    },
    onSuccess: () => {
      invalidateDebtQueries(queryClient);
    },
  });
}

export function useUnarchiveDebt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/api/debts/${id}/unarchive`);
    },
    onSuccess: () => {
      invalidateDebtQueries(queryClient);
    },
  });
}
