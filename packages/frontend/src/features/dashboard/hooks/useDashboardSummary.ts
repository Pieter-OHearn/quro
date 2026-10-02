import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { DashboardAllocationsSummary, NetWorthSnapshot } from '@quro/shared';

type DashboardSummary = { allocations: DashboardAllocationsSummary; netWorth: NetWorthSnapshot[] };

export function useDashboardSummary<T>(select: (summary: DashboardSummary) => T) {
  return useQuery({
    queryKey: queryKeys.dashboard.summary,
    queryFn: async (): Promise<DashboardSummary> => {
      return apiGet<DashboardSummary>('/api/dashboard/summary');
    },
    select,
  });
}
