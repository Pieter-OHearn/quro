import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SavingsTransaction } from '@quro/shared';

export function useUpdateSavingsTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...transaction }: SavingsTransaction) => {
      const { data } = await api.patch(`/api/savings/transactions/${id}`, transaction);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['savings'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
