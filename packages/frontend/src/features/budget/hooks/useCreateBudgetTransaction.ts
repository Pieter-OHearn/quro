import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BUDGET_MONTHS } from '@quro/shared';
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
      // Split the ISO date string directly to avoid local-time vs UTC mismatch
      const [yearStr, monthStr] = variables.date.split('-');
      const month = BUDGET_MONTHS[parseInt(monthStr, 10) - 1] ?? BUDGET_MONTHS[0];
      const year = parseInt(yearStr, 10);
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
