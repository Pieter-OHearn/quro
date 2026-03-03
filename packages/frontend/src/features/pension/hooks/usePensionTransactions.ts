import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiPensionTransaction } from '../types';
import { normalizePensionTransaction } from '../utils/pension-api-normalizers';

export function usePensionTransactions(potId?: number) {
  const normalizedPotId =
    Number.isInteger(potId) && (potId as number) > 0 ? (potId as number) : undefined;

  return useQuery({
    queryKey: ['pensions', 'transactions', normalizedPotId],
    queryFn: async () => {
      const params = normalizedPotId ? { potId: normalizedPotId } : undefined;
      const { data } = await api.get('/api/pensions/transactions', { params });
      return (data.data as ApiPensionTransaction[])
        .map(normalizePensionTransaction)
        .filter((txn) => txn.id > 0 && txn.potId > 0);
    },
  });
}
