import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SavingsAccount } from '@quro/shared';

export function useUpdateSavingsAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...account }: SavingsAccount) => {
      const { data } = await api.patch(`/api/savings/accounts/${id}`, account);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['savings'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
