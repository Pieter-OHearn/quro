import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { HoldingPriceHistoryEntry } from '@quro/shared';
import { addMonthsUtc, monthEndUtc, monthStartUtc } from '../utils/position';
import { normalizeHoldingPriceHistoryEntry } from '../utils/normalizers';

const DATE_PART_LENGTH = 10;
const HISTORY_LOOKBACK_MONTHS = 12;

function toDateOnly(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, DATE_PART_LENGTH);
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
    queryKey: [
      'investments',
      'holdingPriceHistory',
      sortedHoldingIds.join(','),
      range.from,
      range.to,
    ],
    enabled: sortedHoldingIds.length > 0,
    queryFn: async () => {
      const { data } = await api.get('/api/investments/holding-price-history', {
        params: {
          holdingIds: sortedHoldingIds.join(','),
          from: range.from,
          to: range.to,
        },
      });
      return (data.data as HoldingPriceHistoryEntry[]).map(normalizeHoldingPriceHistoryEntry);
    },
  });
}
