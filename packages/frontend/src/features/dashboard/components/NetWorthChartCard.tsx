import { useMemo, useState } from 'react';
import { DEFAULT_NET_WORTH_RANGE, type NetWorthRange, type NetWorthSnapshot } from '@quro/shared';
import { AreaChartCard, SegmentedControl } from '@/components/ui';
import { useNetWorthHistory } from '../hooks';
import type { DashboardFormatFn } from '../types';
import {
  buildNetWorthChartData,
  NET_WORTH_RANGE_OPTIONS,
  netWorthRangeSubtitle,
} from '../utils/net-worth-range';

/** The range control of the chart: a segmented control that fills its row on phones. */
export function NetWorthRangeControl({
  value,
  onChange,
}: Readonly<{ value: NetWorthRange; onChange: (range: NetWorthRange) => void }>) {
  return (
    <SegmentedControl
      aria-label="Net worth range"
      options={NET_WORTH_RANGE_OPTIONS}
      value={value}
      onChange={onChange}
      className="max-sm:w-full"
    />
  );
}

/**
 * The net-worth chart with its range control. Only the chart follows the range: the hero above
 * keeps comparing with the previous month.
 */
export function NetWorthChartCard({
  defaultHistory,
  baseCurrency,
  fmtBase,
  convertToBase,
  initialRange = DEFAULT_NET_WORTH_RANGE,
}: Readonly<{
  defaultHistory: readonly NetWorthSnapshot[];
  baseCurrency: string;
  fmtBase: DashboardFormatFn;
  convertToBase: (amount: number, currency: string) => number;
  initialRange?: NetWorthRange;
}>) {
  const [range, setRange] = useState<NetWorthRange>(initialRange);
  const history = useNetWorthHistory(range, defaultHistory);
  const chartData = useMemo(
    () => buildNetWorthChartData(history.data, range, convertToBase),
    [history.data, range, convertToBase],
  );

  return (
    <AreaChartCard
      className="h-full"
      title="Net worth growth"
      subtitle={netWorthRangeSubtitle(range, history.data, baseCurrency)}
      badge={<NetWorthRangeControl value={range} onChange={setRange} />}
      headerClassName="max-sm:flex-wrap max-sm:py-2"
      headerActionClassName="max-sm:w-full"
      data={chartData}
      dataKey="value"
      estimatedKey="isEstimated"
      xKey="label"
      color="var(--brand)"
      height={220}
      formatValue={fmtBase}
      emptyMessage={
        history.isError
          ? 'Net worth history for this range could not be loaded.'
          : 'No net worth data yet.'
      }
    />
  );
}
