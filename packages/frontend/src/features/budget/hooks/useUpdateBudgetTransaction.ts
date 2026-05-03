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
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
