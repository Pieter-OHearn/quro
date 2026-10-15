/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NetWorthRange, NetWorthSnapshot } from '@quro/shared';
import { SegmentedControl } from '@/components/ui';
import { queryKeys } from '@/lib/queryKeys';
import { NetWorthChartCard, NetWorthRangeControl } from './NetWorthChartCard';
import {
  buildNetWorthChartData,
  netWorthPointLabel,
  netWorthRangeSubtitle,
} from '../utils/net-worth-range';

const fmtBase = (value: number) => `€${value.toFixed(2)}`;
const identity = (amount: number) => amount;

const point = (overrides: Partial<NetWorthSnapshot>): NetWorthSnapshot => ({
  id: 1,
  month: 'Oct',
  year: 2026,
  date: '2026-10-15',
  totalValue: 1000,
  currency: 'EUR',
  isEstimated: false,
  ...overrides,
});

function renderCard(initialRange?: NetWorthRange, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NetWorthChartCard
        defaultHistory={[point({ month: 'Sep', date: '2026-09-30' }), point({})]}
        baseCurrency="EUR"
        fmtBase={fmtBase}
        convertToBase={identity}
        initialRange={initialRange}
      />
    </QueryClientProvider>,
  );
}

const buttons = (markup: string) =>
  [...markup.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>.*?<\/button>/g)].map(
    (match) => ({ html: match[0], pressed: match[1] === 'true' }),
  );

describe('net worth range control', () => {
  test('offers 1M, 6M, 1Y and All with 6M selected by default as a brand-soft tint', () => {
    const markup = renderCard();
    expect(markup).toMatch(/<div role="group"[^>]*aria-label="Net worth range"/);
    const options = buttons(markup);
    expect(options.map((option) => option.html.replace(/<[^>]+>/g, ''))).toEqual([
      '1M1 month',
      '6M6 months',
      '1Y1 year',
      'All',
    ]);
    expect(options[0]!.html).toContain(
      '<span aria-hidden="true">1M</span><span class="sr-only">1 month</span>',
    );
    expect(options.map((option) => option.pressed)).toEqual([false, true, false, false]);
    expect(options[1]!.html).toContain('bg-brand-soft');
    expect(options[1]!.html).not.toContain('bg-brand ');
    expect(markup).toContain('Last 6 months in EUR');
  });

  test('options are native buttons that stretch to 44px on phones', () => {
    const markup = renderCard();
    for (const option of buttons(markup)) {
      expect(option.html).toContain('type="button"');
      expect(option.html).toContain('max-sm:h-11');
      expect(option.html).toContain('max-sm:flex-1');
    }
    // The header wraps on phones and the control takes the whole second row.
    expect(markup).toMatch(/max-sm:flex-wrap[^"]*"/);
    expect(markup).toContain('<div class="flex shrink-0 items-center gap-2 max-sm:w-full">');
  });

  test('a range read from the cache drives the subtitle and selection', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.dashboard.netWorthRange('all'), {
      range: 'all',
      points: [point({ month: 'Jan', year: 2019, date: '2019-01-31' }), point({})],
    });
    const markup = renderCard('all', client);
    expect(markup).toContain('Since Jan 2019 in EUR');
    expect(buttons(markup).map((option) => option.pressed)).toEqual([false, false, false, true]);
  });

  test('until a range has loaded, the series on screen keeps its own subtitle', () => {
    const markup = renderCard('1y');
    expect(buttons(markup).map((option) => option.pressed)).toEqual([false, false, true, false]);
    expect(markup).toContain('Last 6 months in EUR');
  });

  test('choosing an option reports its range', () => {
    const chosen: NetWorthRange[] = [];
    const control = NetWorthRangeControl({ value: '6m', onChange: (range) => chosen.push(range) });
    expect(control.type).toBe(SegmentedControl);
    const group = SegmentedControl(control.props as Parameters<typeof SegmentedControl>[0]);
    const options = (group.props as { children: ReactNode[] }).children.filter(isValidElement);
    for (const option of options as ReactElement<{ onClick: () => void }>[]) {
      option.props.onClick();
    }
    expect(chosen).toEqual(['1m', '6m', '1y', 'all']);
  });

  test('the range query key carries the range under the net-worth prefix', () => {
    expect(queryKeys.dashboard.netWorthRange('1y')).toEqual(['dashboard', 'net-worth', '1y']);
    expect(queryKeys.dashboard.netWorthRange('all').slice(0, 2)).toEqual([
      ...queryKeys.dashboard.netWorth,
    ]);
  });
});

describe('net worth chart labels', () => {
  const october = point({ month: 'Oct', year: 2025, date: '2025-10-09' });

  test('six months keep the month name; longer ranges add the year; a month shows days', () => {
    expect(netWorthPointLabel(october, '6m')).toBe('Oct');
    expect(netWorthPointLabel(october, '1y')).toBe('Oct 25');
    expect(netWorthPointLabel(october, 'all')).toBe('Oct 25');
    expect(netWorthPointLabel(october, '1m')).toBe('09 Oct');
  });

  test('chart data converts each point once and keeps its estimate flag', () => {
    expect(
      buildNetWorthChartData(
        [point({ totalValue: 100, currency: 'GBP', isEstimated: true })],
        '1y',
        (amount, currency) => (currency === 'GBP' ? amount * 2 : amount),
      ),
    ).toEqual([{ label: 'Oct 26', month: 'Oct', year: 2026, value: 200, isEstimated: true }]);
  });

  test('subtitles name the period of each range', () => {
    expect(netWorthRangeSubtitle('1m', [], 'EUR')).toBe('Last 30 days in EUR');
    expect(netWorthRangeSubtitle('6m', [], 'USD')).toBe('Last 6 months in USD');
    expect(netWorthRangeSubtitle('1y', [], 'EUR')).toBe('Last 12 months in EUR');
    expect(netWorthRangeSubtitle('all', [october], 'EUR')).toBe('Since Oct 2025 in EUR');
    expect(netWorthRangeSubtitle('all', [], 'EUR')).toBe('All history in EUR');
  });
});
