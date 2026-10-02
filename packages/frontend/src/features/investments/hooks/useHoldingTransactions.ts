import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { HoldingTransaction } from '@quro/shared';

export function useHoldingTransactions(holdingId?: number) {
  return useQuery({
    queryKey: queryKeys.investments.holdingTransactionList(holdingId),
    queryFn: async () => {
      const params = holdingId ? { holdingId } : {};
      return apiGet<HoldingTransaction[]>('/api/investments/holding-transactions', {
        params,
      });
    },
  });
}
