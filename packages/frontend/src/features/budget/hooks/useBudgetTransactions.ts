import { queryKeys } from '@/lib/queryKeys';
import { apiGetAllPages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { BudgetTx } from '../types';

type Params = { month: string; year: number; categoryId?: number };

export function useBudgetTransactions(params: Params) {
  return useQuery({
    queryKey: queryKeys.budget.transactionList(params.month, params.year, params.categoryId),
    // One month is the window; the hook reads every page of it.
    queryFn: async ({ signal }) => {
      return apiGetAllPages<BudgetTx>('/api/budget/transactions', {
        params: {
          month: params.month,
          year: params.year,
          ...(params.categoryId !== undefined ? { categoryId: params.categoryId } : {}),
        },
        signal,
      });
    },
  });
}
