import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SavingsAccount } from '@quro/shared';

export function useCreateSavingsAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (account: Omit<SavingsAccount, 'id'>) => {
      const { data } = await api.post('/api/savings/accounts', account);
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['savings'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
