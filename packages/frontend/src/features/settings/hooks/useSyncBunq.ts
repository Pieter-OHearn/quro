import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSyncBunq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.post('/api/bunq/sync');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bunq', 'connection'] });
      void queryClient.invalidateQueries({ queryKey: ['savings'] });
      void queryClient.invalidateQueries({ queryKey: ['budget'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
