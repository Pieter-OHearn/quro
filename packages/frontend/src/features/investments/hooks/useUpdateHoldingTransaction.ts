import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { HoldingTransaction } from '@quro/shared';
import { normalizeHoldingTransaction } from '../utils/normalizers';
import { invalidateInvestmentQueries } from '../utils/query-invalidation';

export function useUpdateHoldingTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...transaction }: HoldingTransaction) => {
      const { data } = await api.patch(`/api/investments/holding-transactions/${id}`, transaction);
      return normalizeHoldingTransaction(data.data as HoldingTransaction);
    },
    onSuccess: () => {
      invalidateInvestmentQueries(queryClient);
    },
  });
}
