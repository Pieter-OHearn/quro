import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PensionTransaction } from '@quro/shared';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';

export function useUpdatePensionTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...txn }: PensionTransaction) => {
      const { data } = await api.patch(`/api/pensions/transactions/${id}`, txn);
      return data.data;
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}
