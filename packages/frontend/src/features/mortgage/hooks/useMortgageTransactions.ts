import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { MortgageTransaction } from '@quro/shared';

export function useMortgageTransactions(mortgageId?: number) {
  return useQuery({
    queryKey: queryKeys.mortgages.transactions(mortgageId),
    // Without a selected mortgage there is nothing to show; skip the request
    // rather than fetching every transaction across all mortgages.
    enabled: mortgageId != null,
    queryFn: async () => {
      return apiGet<MortgageTransaction[]>('/api/mortgages/transactions', {
        params: { mortgageId },
      });
    },
  });
}
