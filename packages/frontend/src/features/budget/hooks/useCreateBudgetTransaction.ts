import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatBudgetMonthFromDate } from '@quro/shared';
import { api } from '@/lib/api';
import type { CreateBudgetTransactionInput } from '../types';

export function useCreateBudgetTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction: CreateBudgetTransactionInput) => {
      const { data } = await api.post('/api/budget/transactions', transaction);
      return data.data;
    },
    onSuccess: (_, variables) => {
      const d = new Date(variables.date);
      const month = formatBudgetMonthFromDate(d);
      const year = d.getFullYear();
      void queryClient.invalidateQueries({
        queryKey: ['budget', 'categories', month, year],
      });
      void queryClient.invalidateQueries({
        queryKey: ['budget', 'transactions', month, year],
      });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
