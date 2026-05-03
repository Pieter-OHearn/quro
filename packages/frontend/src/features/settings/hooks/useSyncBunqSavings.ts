import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSyncBunqSavings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.post('/api/bunq/sync/savings');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bunq', 'connection'] });
      void queryClient.invalidateQueries({ queryKey: ['savings'] });
    },
  });
}
