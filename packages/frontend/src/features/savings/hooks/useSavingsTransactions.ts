import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SavingsTransaction } from '@quro/shared';
import { normalizeSavingsTransaction } from '../utils/normalizers';

export function useSavingsTransactions(accountId?: number) {
  return useQuery({
    queryKey: ['savings', 'transactions', accountId],
    queryFn: async () => {
      const params = accountId ? { accountId } : {};
      const { data } = await api.get('/api/savings/transactions', { params });
      return (data.data as SavingsTransaction[]).map(normalizeSavingsTransaction);
    },
  });
}
