import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SavingsAccount } from '@quro/shared';
import { normalizeSavingsAccount } from '../utils/normalizers';

export function useSavingsAccounts() {
  return useQuery({
    queryKey: ['savings', 'accounts'],
    queryFn: async () => {
      const { data } = await api.get('/api/savings/accounts');
      return (data.data as SavingsAccount[]).map(normalizeSavingsAccount);
    },
  });
}
