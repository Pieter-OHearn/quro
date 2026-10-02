import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export type CategoryMapping = {
  id: number;
  userId: number;
  source: string;
  sourceKey: string;
  categoryName: string;
  createdAt: string;
};

export function useCategoryMappings() {
  return useQuery({
    queryKey: queryKeys.budget.mappings,
    queryFn: async () => {
      return apiGet<CategoryMapping[]>('/api/budget/category-mappings');
    },
  });
}
