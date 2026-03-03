import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';

export function useDeletePensionPot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/pensions/pots/${id}`);
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}
