/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NetWorthYearStart } from '@quro/shared';
import { computeNWMetrics, computeYearToDate, toYearStartValue } from '../utils/dashboard-data';
import { NetWorthHero } from './NetWorthHero';

const yearStart = (overrides: Partial<NetWorthYearStart> = {}): NetWorthYearStart => ({
  from: 'previous-year-end',
  month: 'Dec',
  year: 2025,
  date: '2025-12-31',
  totalValue: 100_000,
  currency: 'EUR',
  isEstimated: false,
  ...overrides,
});
const identity = (amount: number) => amount;
const value = (overrides: Partial<NetWorthYearStart> = {}) =>
  toYearStartValue(yearStart(overrides), identity);

describe('year to date', () => {
  test('measures from the previous year end', () => {
    expect(computeYearToDate(125_000, value())).toEqual({ pct: 25, caption: 'year to date' });
  });

  test('a household that started this year names its first month', () => {
    expect(
      computeYearToDate(110_000, value({ from: 'first-point', month: 'Mar', year: 2026 })),
    ).toEqual({ pct: 10, caption: 'since Mar 2026' });
  });

  test('an estimated starting point says so', () => {
    expect(computeYearToDate(125_000, value({ isEstimated: true })).caption).toBe(
      'year to date (estimated)',
    );
  });

  test('a zero, negative or missing start has no percentage', () => {
    expect(computeYearToDate(5_000, value({ totalValue: 0 })).pct).toBeNull();
    expect(computeYearToDate(5_000, value({ totalValue: -2_000 })).pct).toBeNull();
    expect(computeYearToDate(5_000, null).pct).toBeNull();
  });

  test('the start is converted once, like the current figure', () => {
    const converted = toYearStartValue(
      yearStart({ currency: 'EUR', totalValue: 100 }),
      (n) => n * 2,
    );
    expect(converted?.value).toBe(200);
  });

  test('the month change still compares with the previous chart point', () => {
    const chart = [
      { month: 'Sep', year: 2026, value: 120_000, isEstimated: false },
      { month: 'Oct', year: 2026, value: 125_000, isEstimated: false },
    ];
    expect(computeNWMetrics(chart, 125_500, value())).toMatchObject({
      monthChange: 5_500,
      ytdPct: 25.5,
      ytdCaption: 'year to date',
    });
  });
});

const renderHero = (ytdPct: number | null, ytdCaption = 'year to date') =>
  renderToStaticMarkup(
    <NetWorthHero
      netWorth={125_000}
      monthChange={500}
      comparisonLabel="Sep 2026"
      ytdPct={ytdPct}
      ytdCaption={ytdCaption}
      totalAssets={130_000}
      liabilitiesTotal={5_000}
      baseCurrency="EUR"
      fmtBase={(n) => `€${n.toFixed(2)}`}
      isEstimated={false}
    />,
  );

describe('net worth hero', () => {
  test('shows the year-to-date chip with its caption', () => {
    const markup = renderHero(25, 'since Mar 2026');
    expect(markup).toContain('+25.00%');
    expect(markup).toContain('since Mar 2026');
  });

  test('shows no year-to-date chip when the percentage is undefined', () => {
    const markup = renderHero(null);
    expect(markup).not.toContain('year to date');
    expect(markup).not.toContain('%');
    expect(markup).toContain('since Sep 2026');
  });
});
