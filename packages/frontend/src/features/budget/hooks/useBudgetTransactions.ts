import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BudgetTx } from '../types';

export function useBudgetTransactions(categoryId?: number) {
  return useQuery({
    queryKey: ['budget', 'transactions', categoryId],
    queryFn: async () => {
      const params = categoryId ? { categoryId } : {};
      const { data } = await api.get('/api/budget/transactions', { params });
      return data.data as BudgetTx[];
    },
  });
}
