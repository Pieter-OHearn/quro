import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PensionTransaction } from '@quro/shared';
import type { ApiPensionTransaction } from '../types';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';
import { normalizePensionTransaction } from '../utils/pension-api-normalizers';

export function useUpdatePensionTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...txn }: PensionTransaction) => {
      const { data } = await api.patch(`/api/pensions/transactions/${id}`, txn);
      return normalizePensionTransaction(data.data as ApiPensionTransaction);
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}
