import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidatePensionQueries } from '../utils/pension-query-invalidation';

export function useDeletePensionStatementDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId: number) => {
      await api.delete(`/api/pensions/transactions/${transactionId}/document`);
    },
    onSuccess: () => {
      invalidatePensionQueries(queryClient);
    },
  });
}
