import { useQuery } from '@tanstack/react-query';
import type { DashboardInsights } from '@quro/shared';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useDashboardInsights(year: number) {
  return useQuery({
    queryKey: queryKeys.dashboard.insightYear(year),
    queryFn: () => apiGet<DashboardInsights>('/api/dashboard/insights', { params: { year } }),
  });
}
