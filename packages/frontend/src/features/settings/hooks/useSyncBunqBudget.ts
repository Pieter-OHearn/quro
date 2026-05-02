import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSyncBunqBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.post('/api/bunq/sync/budget');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bunq', 'connection'] });
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}
