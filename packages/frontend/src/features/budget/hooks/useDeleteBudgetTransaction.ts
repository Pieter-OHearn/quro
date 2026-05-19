import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDeleteBudgetTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/budget/transactions/${id}`);
    },
    onSuccess: () => {
      // id-only input carries no month/year; broad invalidation until input type is extended
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
