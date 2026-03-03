import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PensionTransaction } from '@quro/shared';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';

export function useCreatePensionTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (txn: Omit<PensionTransaction, 'id'>) => {
      const { data } = await api.post('/api/pensions/transactions', txn);
      return data.data;
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}
