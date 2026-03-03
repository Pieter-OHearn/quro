import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SavingsAccount } from '@quro/shared';

export function useSavingsAccounts() {
  return useQuery({
    queryKey: ['savings', 'accounts'],
    queryFn: async () => {
      const { data } = await api.get('/api/savings/accounts');
      return data.data as SavingsAccount[];
    },
  });
}
