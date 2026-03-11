import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDeleteDebt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/debts/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['debts'] });
      void queryClient.invalidateQueries({ queryKey: ['debts', 'payments'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
