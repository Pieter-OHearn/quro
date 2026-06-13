import { useQuery } from '@tanstack/react-query';
import type { MortgageTransaction } from '@quro/shared';
import { api } from '@/lib/api';
import { normalizeMortgageTransaction } from '../utils/mortgage-normalizers';

export function useMortgageTransactions(mortgageId?: number) {
  return useQuery({
    queryKey: ['mortgages', 'transactions', mortgageId],
    // Without a selected mortgage there is nothing to show; skip the request
    // rather than fetching every transaction across all mortgages.
    enabled: mortgageId != null,
    queryFn: async () => {
      const { data } = await api.get('/api/mortgages/transactions', {
        params: { mortgageId },
      });
      return (data.data as MortgageTransaction[]).map(normalizeMortgageTransaction);
    },
  });
}
