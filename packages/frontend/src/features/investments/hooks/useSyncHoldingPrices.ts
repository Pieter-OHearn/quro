import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { HoldingPriceSyncResult } from '@quro/shared';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

type SyncHoldingPricesInput = {
  holdingIds?: number[];
};

export function useSyncHoldingPrices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SyncHoldingPricesInput = {}) => {
      const { data } = await api.post('/api/investments/holdings/sync-prices', input);
      return data.data as HoldingPriceSyncResult;
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
