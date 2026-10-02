import { useDomainMutation } from '@/lib/useDomainMutation';
import { api, apiPatch } from '@/lib/api';
import type { CategoryMapping } from './useCategoryMappings';

export function useSyncBunq() {
  return useDomainMutation('bunqSync', async () => {
    await api.post('/api/bunq/sync');
  });
}

export function useUpdateCategoryMapping() {
  return useDomainMutation(
    'categoryMapping',
    async ({ id, categoryName }: { id: number; categoryName: string }) => {
      return apiPatch<CategoryMapping>(`/api/budget/category-mappings/${id}`, {
        categoryName,
      });
    },
  );
}

export function useDisconnectBunq() {
  return useDomainMutation('bunqConnection', async () => {
    await api.delete('/api/bunq/connection');
  });
}
