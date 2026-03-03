import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useDeleteProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/investments/properties/${id}`);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
