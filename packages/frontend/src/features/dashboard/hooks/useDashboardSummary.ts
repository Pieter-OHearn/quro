import { useQuery } from '@tanstack/react-query';
import type { DashboardAllocationsSummary, NetWorthSnapshot } from '@quro/shared';
import { api } from '@/lib/api';

type DashboardSummary = { allocations: DashboardAllocationsSummary; netWorth: NetWorthSnapshot[] };

export function useDashboardSummary<T>(select: (summary: DashboardSummary) => T) {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async (): Promise<DashboardSummary> => {
      const { data } = await api.get('/api/dashboard/summary');
      return data.data as DashboardSummary;
    },
    select,
  });
}
