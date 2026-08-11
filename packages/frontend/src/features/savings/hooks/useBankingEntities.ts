import type {
  BankingEntityConfirmationInput,
  BankingEntityOption,
  SavingsAccount,
} from '@quro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useBankingEntities() {
  return useQuery({
    queryKey: ['savings', 'banking-entities'],
    queryFn: async () => {
      const response = await api.get('/api/savings/banking-entities');
      return response.data.data as BankingEntityOption[];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useConfirmBankingEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountId,
      confirmation,
    }: {
      accountId: number;
      confirmation: BankingEntityConfirmationInput;
    }) => {
      const response = await api.patch(
        `/api/savings/accounts/${accountId}/banking-entity`,
        confirmation,
      );
      return response.data.data as SavingsAccount;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['savings'] }),
        queryClient.invalidateQueries({ queryKey: ['plan'] }),
      ]),
  });
}
