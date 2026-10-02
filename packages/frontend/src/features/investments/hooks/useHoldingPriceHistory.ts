import { queryKeys } from '@/lib/queryKeys';
import { apiGet } from '@/lib/api';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addMonthsUtc,
  monthEndUtc,
  monthStartUtc,
  toIsoDate,
  type HoldingPriceHistoryEntry,
} from '@quro/shared';

const HISTORY_LOOKBACK_MONTHS = 12;

function toDateOnly(timestamp: number): string {
  return toIsoDate(new Date(timestamp));
}

export function useHoldingPriceHistory(holdingIds: number[]) {
  const sortedHoldingIds = useMemo(
    () =>
      [...new Set(holdingIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
        (left, right) => left - right,
      ),
    [holdingIds],
  );
  const range = useMemo(() => {
    const currentMonthStart = monthStartUtc(Date.now());
    return {
      from: toDateOnly(addMonthsUtc(currentMonthStart, -HISTORY_LOOKBACK_MONTHS)),
      to: toDateOnly(monthEndUtc(currentMonthStart)),
    };
  }, []);

  return useQuery({
    queryKey: queryKeys.investments.priceHistory(sortedHoldingIds.join(','), range.from, range.to),
    enabled: sortedHoldingIds.length > 0,
    queryFn: async () => {
      return apiGet<HoldingPriceHistoryEntry[]>('/api/investments/holding-price-history', {
        params: {
          holdingIds: sortedHoldingIds.join(','),
          from: range.from,
          to: range.to,
        },
      });
    },
  });
}
