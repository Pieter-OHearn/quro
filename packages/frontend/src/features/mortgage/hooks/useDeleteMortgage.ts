import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDeleteMortgage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/mortgages/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mortgages'] });
      void qc.invalidateQueries({ queryKey: ['investments'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
