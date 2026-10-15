import { useQuery } from '@tanstack/react-query';
import { DEFAULT_NET_WORTH_RANGE, type NetWorthRange, type NetWorthSnapshot } from '@quro/shared';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * The net-worth series of the chart. The default range is the summary's series, so the dashboard
 * makes no second request for it; another range is its own query, keyed by the range. While a
 * range loads for the first time the series on screen stays, so the chart does not collapse.
 */
export function useNetWorthHistory(
  range: NetWorthRange,
  defaultHistory: readonly NetWorthSnapshot[],
) {
  const isDefault = range === DEFAULT_NET_WORTH_RANGE;
  const query = useQuery({
    queryKey: queryKeys.dashboard.netWorthRange(range),
    queryFn: () => apiGet<NetWorthSnapshot[]>('/api/dashboard/net-worth', { params: { range } }),
    enabled: !isDefault,
    placeholderData: isDefault
      ? undefined
      : (previous: NetWorthSnapshot[] | undefined) => previous ?? [...defaultHistory],
  });
  if (isDefault) return { data: defaultHistory, isError: false };
  return { data: query.data ?? [], isError: query.isError };
}
