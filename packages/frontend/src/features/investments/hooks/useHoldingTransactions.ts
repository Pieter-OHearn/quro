import { queryKeys } from '@/lib/queryKeys';
import { apiGetAllPages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { HoldingTransaction } from '@quro/shared';

export function useHoldingTransactions(holdingId?: number) {
  return useQuery({
    queryKey: queryKeys.investments.holdingTransactionList(holdingId),
    queryFn: async ({ signal }) => {
      const params = holdingId ? { holdingId } : {};
      return apiGetAllPages<HoldingTransaction>('/api/investments/holding-transactions', {
        params,
        signal,
      });
    },
  });
}
