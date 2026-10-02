import { useDomainMutation } from '@/lib/useDomainMutation';
import { queryKeys } from '@/lib/queryKeys';
import { apiGet, apiPatch } from '@/lib/api';
import type {
  BankingEntityConfirmationInput,
  BankingEntityOption,
  SavingsAccount,
} from '@quro/shared';
import { useQuery } from '@tanstack/react-query';

export function useBankingEntities() {
  return useQuery({
    queryKey: queryKeys.savings.bankingEntities,
    queryFn: async () => {
      return apiGet<BankingEntityOption[]>('/api/savings/banking-entities');
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useConfirmBankingEntity() {
  return useDomainMutation(
    'bankingEntity',
    async ({
      accountId,
      confirmation,
    }: {
      accountId: number;
      confirmation: BankingEntityConfirmationInput;
    }) => {
      return apiPatch<SavingsAccount>(
        `/api/savings/accounts/${accountId}/banking-entity`,
        confirmation,
      );
    },
  );
}
