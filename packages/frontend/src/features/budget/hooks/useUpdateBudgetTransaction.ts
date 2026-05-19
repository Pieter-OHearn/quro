import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useUpdateBudgetTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, categoryId }: { id: number; categoryId: number }) => {
      const { data } = await api.patch(`/api/budget/transactions/${id}`, { categoryId });
      return data.data;
    },
    onSuccess: () => {
      // id-only input carries no month/year; broad invalidation until input type is extended
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
