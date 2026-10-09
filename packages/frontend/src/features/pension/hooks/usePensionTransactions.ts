import { queryKeys } from '@/lib/queryKeys';
import { apiGetAllPages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { ApiPensionTransaction } from '../types';
import { normalizePensionTransaction } from '../utils/pension-api-normalizers';

export function usePensionTransactions(potId?: number) {
  const normalizedPotId =
    Number.isInteger(potId) && (potId as number) > 0 ? (potId as number) : undefined;

  return useQuery({
    queryKey: queryKeys.pensions.transactionList(normalizedPotId),
    queryFn: async ({ signal }) => {
      const params = normalizedPotId ? { potId: normalizedPotId } : undefined;
      const payload = await apiGetAllPages<ApiPensionTransaction>('/api/pensions/transactions', {
        params,
        signal,
      });
      return payload.map(normalizePensionTransaction).filter((txn) => txn.id > 0 && txn.potId > 0);
    },
  });
}
