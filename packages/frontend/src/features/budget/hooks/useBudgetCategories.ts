import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BudgetCategory } from '../types';

export function useBudgetCategories() {
  return useQuery({
    queryKey: ['budget', 'categories'],
    queryFn: async () => {
      const { data } = await api.get('/api/budget/categories');
      return data.data as BudgetCategory[];
    },
  });
}
