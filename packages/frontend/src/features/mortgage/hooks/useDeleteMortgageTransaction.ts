import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDeleteMortgageTransaction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/mortgages/transactions/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
