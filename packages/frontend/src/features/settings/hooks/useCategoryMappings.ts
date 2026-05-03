import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
    queryKey: ['budget', 'category-mappings'],
    queryFn: async () => {
      const { data } = await api.get('/api/budget/category-mappings');
      return data.data as CategoryMapping[];
    },
  });
}
