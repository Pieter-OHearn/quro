import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { SavingsAccount } from '@quro/shared';

export function useSavingsAccounts() {
  return useSavingsAccountsQuery(false);
}

export function useSavingsAccountsQuery(includeArchived: boolean) {
  return useQuery({
    queryKey: queryKeys.savings.accountList(includeArchived),
    queryFn: async () => {
      return apiGet<SavingsAccount[]>('/api/savings/accounts', {
        params: includeArchived ? { includeArchived: true } : undefined,
      });
    },
  });
}
