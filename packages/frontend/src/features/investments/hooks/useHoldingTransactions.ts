import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { HoldingTransaction } from '@quro/shared';
import { normalizeHoldingTransaction } from '../utils/normalizers';

export function useHoldingTransactions(holdingId?: number) {
  return useQuery({
    queryKey: ['investments', 'holdingTransactions', holdingId],
    queryFn: async () => {
      const params = holdingId ? { holdingId } : {};
      const { data } = await api.get('/api/investments/holding-transactions', {
        params,
      });
      return (data.data as HoldingTransaction[]).map(normalizeHoldingTransaction);
    },
  });
}
