/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Goal, InvestHabitBuyTotal } from '@quro/shared';
import { buildInvestHabitBuys, computeInvestHabitProgress } from './invest-habit';

// EUR base; GBP has a rate, USD has none.
const RATES: Record<string, number> = { EUR: 1, GBP: 1.2 };
const convertToBase = (amount: number, currency: string) => {
  const rate = RATES[currency];
  if (rate === undefined) throw new Error(`Missing synced FX rate for ${currency} -> EUR`);
  return amount * rate;
};

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 1,
  type: 'invest_habit',
  sourceType: 'invest_habit_buys',
  sourceId: null,
  name: 'Investment plan',
  emoji: null,
  currentAmount: 0,
  targetAmount: 0,
  deadline: 'Jun 2027',
  year: 2027,
  category: 'Investing',
  monthlyContribution: 0,
  monthlyTarget: 500,
  monthsCompleted: null,
  totalMonths: 9,
  unit: null,
  color: 'primary',
  notes: '',
  currency: 'EUR',
  startMonth: 'Oct 2026',
  missedMonths: null,
  ...overrides,
});

const progress = (totals: InvestHabitBuyTotal[], currentMonth: string, overrides = {}) =>
  computeInvestHabitProgress(
    goal(overrides),
    buildInvestHabitBuys(totals, convertToBase),
    convertToBase,
    currentMonth,
  );

test('the months run from the start month to the deadline, with a state each', () => {
  const result = progress(
    [
      { month: '2026-10', currency: 'EUR', amount: 520 },
      { month: '2026-11', currency: 'EUR', amount: 200 },
      { month: '2026-12', currency: 'EUR', amount: 120 },
    ],
    '2026-12',
  );
  expect(result.months.map((month) => [month.key, month.state])).toEqual([
    ['2026-10', 'hit'],
    ['2026-11', 'missed'],
    ['2026-12', 'current'],
    ['2027-01', 'future'],
    ['2027-02', 'future'],
    ['2027-03', 'future'],
    ['2027-04', 'future'],
    ['2027-05', 'future'],
    ['2027-06', 'future'],
  ]);
  expect(result.hits).toBe(1);
  expect(result.dueMonths).toBe(2);
  expect(result.behind).toBe(true);
  expect(result.investedSoFar).toBe(840);
  expect(result.currentMonthInvested).toBe(120);
  expect(result.monthlyTarget).toBe(500);
  expect(result.missingRate).toBe(false);
});

test('a month is a hit at or above the target and not below it', () => {
  const states = (amount: number) =>
    progress([{ month: '2026-10', currency: 'EUR', amount }], '2026-11').months[0]!.state;
  expect(states(499.99)).toBe('missed');
  expect(states(500)).toBe('hit');
  expect(states(500.01)).toBe('hit');
});

test('the current month counts once its target is reached', () => {
  const below = progress([{ month: '2026-10', currency: 'EUR', amount: 499 }], '2026-10');
  expect(below.months[0]!.state).toBe('current');
  expect(below.dueMonths).toBe(0);
  expect(below.behind).toBe(false);
  const reached = progress([{ month: '2026-10', currency: 'EUR', amount: 500 }], '2026-10');
  expect(reached.months[0]!.state).toBe('hit');
  expect(reached.dueMonths).toBe(1);
  expect(reached.hits).toBe(1);
});

test('buys in several currencies add up in the base currency, in cents', () => {
  // 300 EUR + 166.67 GBP × 1.2 = 300 + 200.004 → 500.00 EUR
  const result = progress(
    [
      { month: '2026-10', currency: 'EUR', amount: 300 },
      { month: '2026-10', currency: 'GBP', amount: 166.67 },
    ],
    '2026-11',
  );
  expect(result.months[0]).toMatchObject({ state: 'hit', invested: 500 });
});

test('a buy in a currency without a rate fails closed and is reported', () => {
  const result = progress(
    [
      { month: '2026-10', currency: 'EUR', amount: 100 },
      { month: '2026-10', currency: 'USD', amount: 900 },
    ],
    '2026-11',
  );
  expect(result.months[0]).toMatchObject({ state: 'missed', invested: 100 });
  expect(result.missingRate).toBe(true);
  expect(result.investedSoFar).toBe(100);
});

test('a missing rate outside the range is not reported', () => {
  const result = progress([{ month: '2026-09', currency: 'USD', amount: 900 }], '2026-11');
  expect(result.missingRate).toBe(false);
});

test('a monthly target in a currency without a rate counts no hits', () => {
  const result = progress([{ month: '2026-10', currency: 'EUR', amount: 5000 }], '2026-11', {
    currency: 'USD',
  });
  expect(result.monthlyTarget).toBeNull();
  expect(result.hits).toBe(0);
  expect(result.missingRate).toBe(true);
});

test('buys before the start month or after the deadline do not count, even in the same year', () => {
  const result = progress(
    [
      { month: '2026-01', currency: 'EUR', amount: 900 },
      { month: '2026-09', currency: 'EUR', amount: 900 },
      { month: '2027-07', currency: 'EUR', amount: 900 },
      { month: '2027-12', currency: 'EUR', amount: 900 },
    ],
    '2027-08',
  );
  expect(result.hits).toBe(0);
  expect(result.investedSoFar).toBe(0);
  expect(result.currentMonthInvested).toBeNull();
});

test('a habit started in January counts January buys recorded before it was created', () => {
  const result = progress([{ month: '2027-01', currency: 'EUR', amount: 650 }], '2027-01', {
    startMonth: 'Jan 2027',
    deadline: 'Dec 2027',
  });
  expect(result.months).toHaveLength(12);
  expect(result.months[0]).toMatchObject({ key: '2027-01', state: 'hit' });
  expect(result.hits).toBe(1);
});

test('a habit saved without a start month keeps its months from January of its year', () => {
  const result = progress([{ month: '2026-02', currency: 'EUR', amount: 500 }], '2026-11', {
    startMonth: null,
    deadline: 'Dec 2026',
    year: 2026,
    totalMonths: 6,
  });
  expect(result.months.map((month) => month.key)).toEqual([
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
  ]);
  expect(result.hits).toBe(1);
});
