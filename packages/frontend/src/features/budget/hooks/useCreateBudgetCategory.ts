import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateBudgetCategoryInput } from '../types';

export function useCreateBudgetCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (category: CreateBudgetCategoryInput) => {
      const { data } = await api.post('/api/budget/categories', category);
      return data.data;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['budget', 'categories', variables.month, variables.year],
      });
      void queryClient.invalidateQueries({
        queryKey: ['budget', 'transactions', variables.month, variables.year],
      });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
