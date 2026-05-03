import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BudgetCategory } from '../types';
import { normalizeBudgetCategory } from '../utils/normalizers';

type Params = { month: string; year: number };

export function useBudgetCategories(params: Params) {
  return useQuery({
    queryKey: ['budget', 'categories', params.month, params.year],
    queryFn: async () => {
      const { data } = await api.get('/api/budget/categories', {
        params: { month: params.month, year: params.year },
      });
      return (data.data as BudgetCategory[]).map(normalizeBudgetCategory);
    },
  });
}
