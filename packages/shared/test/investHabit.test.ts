/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import {
  countGoalMonths,
  formatGoalMonth,
  goalMonthKey,
  goalStartEndMonths,
  investHabitMonths,
  parseGoalMonth,
  sumInvestHabitBuys,
} from '../src/index.js';

describe('goal months', () => {
  test('reads month labels and month keys', () => {
    expect(parseGoalMonth('Oct 2026')).toEqual({ year: 2026, month: 9 });
    expect(parseGoalMonth(' Jan 2027 ')).toEqual({ year: 2027, month: 0 });
    expect(parseGoalMonth('2026-03')).toEqual({ year: 2026, month: 2 });
    for (const value of [
      '',
      null,
      undefined,
      'TBD',
      'October 2026',
      '2026-13',
      '2026-00',
      'Okt 2026',
    ]) {
      expect(parseGoalMonth(value)).toBeNull();
    }
  });

  test('formats, keys and counts months across a year boundary', () => {
    const start = { year: 2026, month: 9 };
    const end = { year: 2027, month: 5 };
    expect(formatGoalMonth(start)).toBe('Oct 2026');
    expect(goalMonthKey(end)).toBe('2027-06');
    expect(countGoalMonths(start, end)).toBe(9);
    expect(countGoalMonths(start, start)).toBe(1);
    expect(countGoalMonths(end, start)).toBe(0);
  });

  test('a start and end month need both months, in order', () => {
    expect(goalStartEndMonths({ startMonth: 'Oct 2026', deadline: 'Jun 2027' })).not.toBeNull();
    expect(goalStartEndMonths({ startMonth: null, deadline: 'Jun 2027' })).toBeNull();
    expect(goalStartEndMonths({ startMonth: 'Oct 2026', deadline: 'TBD' })).toBeNull();
    expect(goalStartEndMonths({ startMonth: 'Jul 2027', deadline: 'Jun 2027' })).toBeNull();
  });

  test('an invest habit runs from its start month to its deadline', () => {
    const months = investHabitMonths({ startMonth: 'Oct 2026', deadline: 'Jun 2027' }, 2026);
    expect(months.map(goalMonthKey)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
    ]);
  });

  test('a habit without a start month keeps its total months from January of its year', () => {
    const legacy = { startMonth: null, deadline: 'Dec 2025', year: 2025, totalMonths: 3 };
    expect(investHabitMonths(legacy, 2026).map(goalMonthKey)).toEqual([
      '2025-01',
      '2025-02',
      '2025-03',
    ]);
    expect(investHabitMonths({ deadline: 'Dec 2025', totalMonths: 40 }, 2026)).toHaveLength(12);
    expect(investHabitMonths({ deadline: 'TBD' }, 2026)[0]).toEqual({ year: 2026, month: 0 });
  });
});

describe('invest habit buys', () => {
  test('sum shares × price per month and currency, each buy rounded to cents once', () => {
    expect(
      sumInvestHabitBuys([
        { date: '2026-10-01', currency: 'EUR', shares: 1.5, price: 33.333 },
        { date: '2026-10-31', currency: 'EUR', shares: 0.5, price: 0.01 },
        { date: '2026-10-15', currency: 'USD', shares: 2, price: 100 },
        { date: '2026-11-02', currency: 'EUR', shares: 3, price: 0.1 },
        // Numeric columns may arrive as decimal strings.
        { date: '2026-11-03', currency: 'EUR', shares: '0.2', price: '0.1' },
      ]),
    ).toEqual([
      { month: '2026-10', currency: 'EUR', amount: 50.01 },
      { month: '2026-10', currency: 'USD', amount: 200 },
      { month: '2026-11', currency: 'EUR', amount: 0.32 },
    ]);
  });

  test('skip rows without a usable date', () => {
    expect(sumInvestHabitBuys([{ date: '', currency: 'EUR', shares: 1, price: 1 }])).toEqual([]);
  });
});
