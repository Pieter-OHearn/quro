import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BudgetTx } from '../types';
import { normalizeBudgetTransaction } from '../utils/normalizers';

type Params = { month: string; year: number; categoryId?: number };

export function useBudgetTransactions(params: Params) {
  return useQuery({
    queryKey: ['budget', 'transactions', params.month, params.year, params.categoryId],
    queryFn: async () => {
      const { data } = await api.get('/api/budget/transactions', {
        params: {
          month: params.month,
          year: params.year,
          ...(params.categoryId !== undefined ? { categoryId: params.categoryId } : {}),
        },
      });
      return (data.data as BudgetTx[]).map(normalizeBudgetTransaction);
    },
  });
}
