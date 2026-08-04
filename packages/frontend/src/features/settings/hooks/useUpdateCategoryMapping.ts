import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useUpdateCategoryMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, categoryName }: { id: number; categoryName: string }) => {
      const { data } = await api.patch(`/api/budget/category-mappings/${id}`, { categoryName });
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budget', 'category-mappings'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
