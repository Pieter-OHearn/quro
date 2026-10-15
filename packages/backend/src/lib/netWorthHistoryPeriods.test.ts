import { describe, expect, test } from 'bun:test';
import { buildHistoryPeriods, NET_WORTH_ALL_MAX_MONTHS } from './netWorthHistory';

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
