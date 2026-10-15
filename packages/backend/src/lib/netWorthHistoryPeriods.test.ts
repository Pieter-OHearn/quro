import { describe, expect, test } from 'bun:test';
import {
  buildDashboardHistory,
  buildHistoryPeriods,
  buildNetWorthHistory,
  buildYearStartPeriod,
  NET_WORTH_ALL_MAX_MONTHS,
} from './netWorthHistory';

// 31 Mar 2028, mid-morning UTC: a leap year, and a month end, so day and month boundaries meet.
const NOW = Date.UTC(2028, 2, 31, 10, 30);
const dates = (periods: ReturnType<typeof buildHistoryPeriods>) =>
  periods.map((period) => period.asOfDate);

describe('net worth history periods', () => {
  test('6m is the default: six month ends, then now', () => {
    const periods = buildHistoryPeriods(undefined, NOW);
    expect(periods).toEqual(buildHistoryPeriods('6m', NOW));
    expect(dates(periods)).toEqual([
      '2027-09-30',
      '2027-10-31',
      '2027-11-30',
      '2027-12-31',
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
    ]);
    expect(periods.map((period) => period.label)).toEqual([
      'Sep',
      'Oct',
      'Nov',
      'Dec',
      'Jan',
      'Feb',
      'Mar',
    ]);
    expect(periods.at(-1)).toMatchObject({
      cutoff: NOW,
      isCurrent: true,
      snapshotDate: '2028-03-31',
    });
    expect(periods.filter((period) => period.isCurrent)).toHaveLength(1);
  });

  test('1y has twelve month ends, then now', () => {
    const periods = buildHistoryPeriods('1y', NOW);
    expect(periods).toHaveLength(13);
    expect(periods[0]).toMatchObject({ asOfDate: '2027-03-31', year: 2027, label: 'Mar' });
  });

  test('1m has a point per day for 30 days, then now, and never uses a snapshot', () => {
    const periods = buildHistoryPeriods('1m', NOW);
    expect(periods).toHaveLength(31);
    expect(dates(periods).slice(0, 3)).toEqual(['2028-03-01', '2028-03-02', '2028-03-03']);
    expect(periods.every((period) => period.snapshotDate === null)).toBe(true);
    expect(periods[0]!.cutoff).toBe(Date.UTC(2028, 2, 1, 23, 59, 59, 999));
    expect(periods.at(-1)).toMatchObject({ asOfDate: '2028-03-31', cutoff: NOW, isCurrent: true });
  });

  test('1m crosses month and year ends by calendar day', () => {
    const periods = buildHistoryPeriods('1m', Date.UTC(2029, 0, 10, 12));
    expect(dates(periods).slice(0, 2)).toEqual(['2028-12-11', '2028-12-12']);
    expect(periods[0]).toMatchObject({ label: 'Dec', year: 2028 });
  });

  test('all starts at the month of the first record', () => {
    const periods = buildHistoryPeriods('all', NOW, '2024-02-10');
    expect(periods[0]!.asOfDate).toBe('2024-02-29');
    expect(periods).toHaveLength(50);
  });

  test('all without a record, or with one this month or later, is the current month only', () => {
    for (const first of [null, '2028-03-01', '2031-01-01']) {
      expect(dates(buildHistoryPeriods('all', NOW, first))).toEqual(['2028-03-31']);
    }
  });

  test(`all is capped at ${NET_WORTH_ALL_MAX_MONTHS} months before the current one`, () => {
    const periods = buildHistoryPeriods('all', NOW, '1900-01-01');
    expect(periods).toHaveLength(NET_WORTH_ALL_MAX_MONTHS + 1);
    expect(periods[0]!.asOfDate).toBe('1998-03-31');
  });
});

describe('year-start period', () => {
  const OCTOBER = Date.UTC(2026, 9, 15, 12);

  test('a household with a record before 1 January measures from the previous year end', () => {
    for (const first of ['2019-05-01', '2025-12-31']) {
      expect(buildYearStartPeriod(OCTOBER, first)).toMatchObject({
        from: 'previous-year-end',
        asOfDate: '2025-12-31',
        snapshotDate: '2025-12-31',
        label: 'Dec',
        year: 2025,
        isCurrent: false,
      });
    }
  });

  test('a household that started this year measures from its first month end', () => {
    expect(buildYearStartPeriod(OCTOBER, '2026-03-09')).toMatchObject({
      from: 'first-point',
      asOfDate: '2026-03-31',
      label: 'Mar',
      year: 2026,
    });
    expect(buildYearStartPeriod(OCTOBER, '2026-01-01')).toMatchObject({ asOfDate: '2026-01-31' });
  });

  test('a household that started this month measures from now; none without a record', () => {
    expect(buildYearStartPeriod(OCTOBER, '2026-10-02')).toMatchObject({
      from: 'first-point',
      cutoff: OCTOBER,
      isCurrent: true,
    });
    expect(buildYearStartPeriod(OCTOBER, null)).toBeNull();
  });
});

describe('year-to-date baseline in the dashboard history', () => {
  const OCTOBER = Date.UTC(2026, 9, 15, 12);
  const source = (transactions: Array<{ amount: number; date: string }>, firstRecord: string) =>
    ({
      rates: new Map([['EUR', 1]]),
      historicalRates: [],
      savings: [{ id: 1, balance: 3000, currency: 'EUR' }],
      savingsTransactions: transactions.map((row) => ({ accountId: 1, type: 'deposit', ...row })),
      holdings: [],
      holdingTransactions: [],
      holdingPrices: [],
      properties: [],
      propertyTransactions: [],
      pensions: [],
      pensionTransactions: [],
      mortgages: [],
      debts: [],
      debtPayments: [],
      snapshots: [],
      periods: buildHistoryPeriods('6m', OCTOBER),
      yearStart: buildYearStartPeriod(OCTOBER, firstRecord),
    }) as unknown as Parameters<typeof buildDashboardHistory>[0];

  test('in October, with data since last year, it is the value at 31 December', () => {
    const data = source(
      [
        { amount: 500, date: '2025-06-01' },
        { amount: 1000, date: '2026-02-15' },
        { amount: 700, date: '2026-05-20' },
      ],
      '2025-06-01',
    );
    const { netWorth, yearStart } = buildDashboardHistory(data);
    expect(yearStart).toMatchObject({
      from: 'previous-year-end',
      date: '2025-12-31',
      month: 'Dec',
      year: 2025,
      totalValue: 3000 - 1000 - 700,
      currency: 'EUR',
      isEstimated: true,
    });
    // The seven-month series starts in April, after the February deposit: its first point of the
    // year was the old baseline. The series itself is the plain history.
    expect(netWorth[0]).toMatchObject({ date: '2026-04-30', totalValue: 3000 - 700 });
    expect(netWorth).toEqual(buildNetWorthHistory(data));
  });

  test('a household that started in March measures from 31 March', () => {
    const { yearStart } = buildDashboardHistory(
      source(
        [
          { amount: 1000, date: '2026-03-09' },
          { amount: 500, date: '2026-06-01' },
        ],
        '2026-03-09',
      ),
    );
    expect(yearStart).toMatchObject({ from: 'first-point', date: '2026-03-31', totalValue: 2500 });
  });

  test('without a record there is no year-start point', () => {
    const none = { ...source([], '2026-01-01'), yearStart: buildYearStartPeriod(OCTOBER, null) };
    expect(buildDashboardHistory(none).yearStart).toBeNull();
  });
});
