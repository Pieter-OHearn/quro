import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { DashboardTransaction } from '@quro/shared';

export function useDashboardTransactions() {
  return useQuery({
    queryKey: queryKeys.dashboard.transactions,
    queryFn: async () => {
      return apiGet<DashboardTransaction[]>('/api/dashboard/transactions');
    },
  });
}
