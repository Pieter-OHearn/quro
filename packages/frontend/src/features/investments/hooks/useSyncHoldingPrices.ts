import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { HoldingPriceSyncResult } from '@quro/shared';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useSyncHoldingPrices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/investments/holdings/sync-prices');
      return data.data as HoldingPriceSyncResult;
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
