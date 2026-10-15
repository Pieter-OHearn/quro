import type { ReactNode } from 'react';
import type { NetWorthRange, NetWorthSnapshot } from '@quro/shared';
import type { NetWorthChartPoint } from '../types';

const RANGE_NAMES: ReadonlyArray<{ value: NetWorthRange; short: string; spoken: string }> = [
  { value: '1m', short: '1M', spoken: '1 month' },
  { value: '6m', short: '6M', spoken: '6 months' },
  { value: '1y', short: '1Y', spoken: '1 year' },
  { value: 'all', short: 'All', spoken: 'All' },
];

// The short label is shown; screen readers hear the period in words instead of "1 M".
export const NET_WORTH_RANGE_OPTIONS: ReadonlyArray<{ value: NetWorthRange; label: ReactNode }> =
  RANGE_NAMES.map(({ value, short, spoken }) => ({
    value,
    label:
      short === spoken ? (
        short
      ) : (
        <>
          <span aria-hidden="true">{short}</span>
          <span className="sr-only">{spoken}</span>
        </>
      ),
  }));

const SHORT_YEAR_DIGITS = 2;
const DAY_START = 8;
const DAY_END = 10;

/**
 * The axis and tooltip label of a point: "Oct" for six months (as before ranges existed),
 * "Oct 25" once a series can repeat a month, and "09 Oct" for the daily points of a month.
 */
export function netWorthPointLabel(point: NetWorthSnapshot, range: NetWorthRange): string {
  if (range === '6m') return point.month;
  if (range === '1m') return `${point.date.slice(DAY_START, DAY_END)} ${point.month}`;
  return `${point.month} ${String(point.year).slice(-SHORT_YEAR_DIGITS)}`;
}

export function buildNetWorthChartData(
  snapshots: readonly NetWorthSnapshot[],
  range: NetWorthRange,
  convertToBase: (amount: number, currency: string) => number,
): NetWorthChartPoint[] {
  return snapshots.map((snapshot) => ({
    label: netWorthPointLabel(snapshot, range),
    month: snapshot.month,
    year: snapshot.year,
    value: convertToBase(snapshot.totalValue, snapshot.currency),
    isEstimated: snapshot.isEstimated,
  }));
}

export function netWorthRangeSubtitle(
  range: NetWorthRange,
  points: readonly Pick<NetWorthSnapshot, 'month' | 'year'>[],
  baseCurrency: string,
): string {
  const first = points[0];
  const period = {
    '1m': 'Last 30 days',
    '6m': 'Last 6 months',
    '1y': 'Last 12 months',
    all: first ? `Since ${first.month} ${first.year}` : 'All history',
  }[range];
  return `${period} in ${baseCurrency}`;
}
