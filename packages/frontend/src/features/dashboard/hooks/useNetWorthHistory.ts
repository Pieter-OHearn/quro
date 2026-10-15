import { useQuery } from '@tanstack/react-query';
import { DEFAULT_NET_WORTH_RANGE, type NetWorthRange, type NetWorthSnapshot } from '@quro/shared';
import { apiGet } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/** A series together with the range it was read for, so labels always match the points. */
export type NetWorthRangeHistory = {
  range: NetWorthRange;
  points: readonly NetWorthSnapshot[];
};

/**
 * The net-worth series of the chart. The default range is the summary's series, so the dashboard
 * makes no second request for it; another range is its own query, keyed by the range. While a
 * range loads for the first time the series on screen stays, with its own range, so the chart
 * neither collapses nor labels old points with the new range.
 */
export function useNetWorthHistory(
  range: NetWorthRange,
  defaultHistory: readonly NetWorthSnapshot[],
): NetWorthRangeHistory & { isError: boolean } {
  const isDefault = range === DEFAULT_NET_WORTH_RANGE;
  const query = useQuery({
    queryKey: queryKeys.dashboard.netWorthRange(range),
    queryFn: async (): Promise<NetWorthRangeHistory> => ({
      range,
      points: await apiGet<NetWorthSnapshot[]>('/api/dashboard/net-worth', { params: { range } }),
    }),
    enabled: !isDefault,
    placeholderData: isDefault
      ? undefined
      : (previous: NetWorthRangeHistory | undefined) =>
          previous ?? { range: DEFAULT_NET_WORTH_RANGE, points: defaultHistory },
  });
  if (isDefault) return { range, points: defaultHistory, isError: false };
  return {
    range: query.data?.range ?? range,
    points: query.data?.points ?? [],
    isError: query.isError,
  };
}
