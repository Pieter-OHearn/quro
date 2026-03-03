import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { HoldingTransaction } from '@quro/shared';
import { normalizeHoldingTransaction } from '../utils/normalizers';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useCreateHoldingTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transaction: Omit<HoldingTransaction, 'id'>) => {
      const { data } = await api.post('/api/investments/holding-transactions', transaction);
      return normalizeHoldingTransaction(data.data as HoldingTransaction);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
