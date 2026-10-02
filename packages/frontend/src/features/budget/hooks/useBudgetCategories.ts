import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { BudgetCategory } from '../types';
import { normalizeBudgetCategory } from '../utils/normalizers';

type Params = { month: string; year: number };

export function useBudgetCategories(params: Params) {
  return useQuery({
    queryKey: queryKeys.budget.categoryList(params.month, params.year),
    queryFn: async () => {
      const payload = await apiGet<BudgetCategory[]>('/api/budget/categories', {
        params: { month: params.month, year: params.year },
      });
      return payload.map(normalizeBudgetCategory);
    },
  });
}
