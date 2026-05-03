import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDisconnectBunq() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.delete('/api/bunq/connection');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bunq', 'connection'] });
    },
  });
}
