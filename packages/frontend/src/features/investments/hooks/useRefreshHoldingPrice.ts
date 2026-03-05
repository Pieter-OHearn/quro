import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useRefreshHoldingPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (holdingId: number) => {
      const { data } = await api.post(`/api/investments/holdings/${holdingId}/refresh-price`);
      return data;
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
