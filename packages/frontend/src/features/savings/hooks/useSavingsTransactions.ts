import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { SavingsTransaction } from '@quro/shared';
import { normalizeSavingsTransaction } from '../utils/normalizers';

export function useSavingsTransactions(accountId?: number) {
  return useQuery({
    queryKey: queryKeys.savings.transactionList(accountId),
    queryFn: async () => {
      const params = accountId ? { accountId } : {};
      const payload = await apiGet<SavingsTransaction[]>('/api/savings/transactions', { params });
      return payload.map(normalizeSavingsTransaction);
    },
  });
}
