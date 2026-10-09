import { queryKeys } from '@/lib/queryKeys';
import { apiGetAllPages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { SavingsTransaction } from '@quro/shared';
import { normalizeSavingsTransaction } from '../utils/normalizers';

export function useSavingsTransactions(accountId?: number) {
  return useQuery({
    queryKey: queryKeys.savings.transactionList(accountId),
    queryFn: async ({ signal }) => {
      const params = accountId ? { accountId } : {};
      const payload = await apiGetAllPages<SavingsTransaction>('/api/savings/transactions', {
        params,
        signal,
      });
      return payload.map(normalizeSavingsTransaction);
    },
  });
}
