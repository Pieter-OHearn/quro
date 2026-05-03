import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SavingsAccount } from '@quro/shared';
import { normalizeSavingsAccount } from '../utils/normalizers';

export function useSavingsAccounts() {
  return useSavingsAccountsQuery(false);
}

export function useSavingsAccountsQuery(includeArchived: boolean) {
  return useQuery({
    queryKey: ['savings', 'accounts', { includeArchived }],
    queryFn: async () => {
      const { data } = await api.get('/api/savings/accounts', {
        params: includeArchived ? { includeArchived: true } : undefined,
      });
      return (data.data as SavingsAccount[]).map(normalizeSavingsAccount);
    },
  });
}
