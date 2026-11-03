/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Goal } from '@quro/shared';
import type { GoalProgressContext } from '../types';
import {
  formatInvestHabitHits,
  getGoalPct,
  getGoalStatus,
  getGoalYears,
  goalCoversYear,
  isAboveLowerIsBetterTarget,
  resolveGoalCurrentAmount,
} from './goal-utils';
import { computeGoalStats, computeGoalYears } from './goals-data';
import { buildInvestHabitBuys, EMPTY_INVEST_HABIT_BUYS } from './invest-habit';

const convertToBase = (amount: number, _currency: string) => amount;

const baseContext: GoalProgressContext = {
  annualGross: 84000,
  savingsAccounts: [],
  portfolioTotal: 75000,
  netWorth: 200000,
  investHabitBuys: EMPTY_INVEST_HABIT_BUYS,
  currentMonth: '2026-11',
  convertToBase,
};

const buildGoal = (overrides: Partial<Goal>): Goal => ({
  id: 1,
  type: 'savings',
  sourceType: 'manual',
  sourceId: null,
  name: 'Emergency Fund',
  emoji: 'E',
  currentAmount: 2500,
  targetAmount: 10000,
  deadline: '2026-12',
  year: 2026,
  category: 'Savings',
  monthlyContribution: 250,
  monthlyTarget: null,
  monthsCompleted: null,
  totalMonths: null,
  unit: null,
  color: '#2563eb',
  notes: '',
  currency: 'EUR',
  ...overrides,
});

test('uses manual current amount for unlinked amount goals', () => {
  const goal = buildGoal({ currentAmount: 4000, targetAmount: 10000 });

  expect(resolveGoalCurrentAmount(goal, baseContext)).toMatchObject({
    currentAmount: 4000,
    status: 'manual',
  });
  expect(getGoalPct(goal, baseContext)).toBe(40);
});

test('uses latest annualized gross for salary-linked goals', () => {
  const goal = buildGoal({
    type: 'salary',
    sourceType: 'salary_latest_gross',
    currentAmount: 0,
    targetAmount: 120000,
  });

  expect(resolveGoalCurrentAmount(goal, baseContext)).toMatchObject({
    currentAmount: 84000,
    status: 'linked',
  });
  expect(getGoalPct(goal, baseContext)).toBe(70);
});

test('uses selected savings account balance for savings-account-linked goals', () => {
  const goal = buildGoal({
    sourceType: 'savings_account',
    sourceId: 42,
    currentAmount: 1000,
    targetAmount: 10000,
  });
  const context: GoalProgressContext = {
    ...baseContext,
    savingsAccounts: [
      {
        id: 42,
        name: 'Rainy Day',
        balance: 6500,
        currency: 'EUR',
        archivedAt: null,
      },
    ],
  };

  expect(resolveGoalCurrentAmount(goal, context)).toMatchObject({
    currentAmount: 6500,
    status: 'linked',
    label: 'Rainy Day',
  });
  expect(getGoalPct(goal, context)).toBe(65);
});

test('falls back to saved current amount when a linked savings account is unavailable', () => {
  const goal = buildGoal({
    sourceType: 'savings_account',
    sourceId: 42,
    currentAmount: 1750,
    targetAmount: 7000,
  });

  expect(resolveGoalCurrentAmount(goal, baseContext)).toMatchObject({
    currentAmount: 1750,
    status: 'missing',
    label: 'Linked savings account unavailable',
  });
  expect(getGoalPct(goal, baseContext)).toBe(25);
});

test('resolves portfolio goal from live portfolio total', () => {
  const goal = buildGoal({
    type: 'portfolio',
    sourceType: 'portfolio_total',
    currentAmount: 0,
    targetAmount: 150000,
  });

  const result = resolveGoalCurrentAmount(goal, baseContext);
  expect(result).toMatchObject({
    currentAmount: 75000,
    status: 'linked',
    label: 'Portfolio value',
  });
  expect(getGoalPct(goal, baseContext)).toBe(50);
});

test('resolves net_worth goal from live net worth', () => {
  const goal = buildGoal({
    type: 'net_worth',
    sourceType: 'net_worth_total',
    currentAmount: 0,
    targetAmount: 400000,
  });

  const result = resolveGoalCurrentAmount(goal, baseContext);
  expect(result).toMatchObject({
    currentAmount: 200000,
    status: 'linked',
    label: 'Net worth',
  });
  expect(getGoalPct(goal, baseContext)).toBe(50);
});

const habit = (overrides: Partial<Goal> = {}): Goal =>
  buildGoal({
    type: 'invest_habit',
    sourceType: 'invest_habit_buys',
    startMonth: 'Oct 2026',
    deadline: 'Jun 2027',
    year: 2027,
    totalMonths: 9,
    monthlyTarget: 500,
    monthlyContribution: 0,
    currentAmount: 0,
    targetAmount: 0,
    ...overrides,
  });

const withBuys = (
  context: GoalProgressContext,
  totals: Array<[string, number]>,
  currentMonth = context.currentMonth,
): GoalProgressContext => ({
  ...context,
  currentMonth,
  investHabitBuys: buildInvestHabitBuys(
    totals.map(([month, amount]) => ({ month, currency: 'EUR', amount })),
    context.convertToBase,
  ),
});

test('a goal with a start month shows in every year from its start to its deadline', () => {
  const goal = habit();
  expect(getGoalYears(goal, 2026)).toEqual([2026, 2027]);
  expect(goalCoversYear(goal, 2026, 2026)).toBe(true);
  expect(goalCoversYear(goal, 2027, 2026)).toBe(true);
  expect(goalCoversYear(goal, 2028, 2026)).toBe(false);
  expect(getGoalYears(habit({ startMonth: 'Nov 2025', deadline: 'Feb 2028' }), 2026)).toEqual([
    2025, 2026, 2027, 2028,
  ]);
});

test('a goal without a start month keeps its one year', () => {
  expect(getGoalYears(buildGoal({ year: 2027, deadline: 'Dec 2027' }), 2026)).toEqual([2027]);
  expect(getGoalYears(habit({ startMonth: null, year: 2026 }), 2026)).toEqual([2026]);
  // A range that does not parse or runs backwards falls back to the goal's year.
  expect(getGoalYears(habit({ startMonth: 'Aug 2027' }), 2026)).toEqual([2027]);
});

test('the year tabs include every year a goal covers, and each year counts the goal', () => {
  const goals = [habit(), buildGoal({ id: 2, year: 2025, deadline: 'Dec 2025' })];
  expect(computeGoalYears(goals, 2026)).toEqual([2025, 2026, 2027]);
  const context = withBuys(baseContext, [['2026-10', 500]]);
  for (const year of [2026, 2027]) {
    const yearGoals = goals.filter((goal) => goalCoversYear(goal, year, 2026));
    expect(yearGoals.map((goal) => goal.id)).toEqual([1]);
    expect(computeGoalStats(yearGoals, context, 2026)).toMatchObject({
      total: 1,
      onTrack: 1,
      monthly: 500,
    });
  }
});

test('an invest habit counts hits over its own months, across a year boundary', () => {
  const context = withBuys(
    baseContext,
    [
      ['2026-09', 900],
      ['2026-10', 500],
      ['2026-11', 499.99],
      ['2026-12', 750],
      ['2027-01', 600],
      ['2027-07', 900],
    ],
    '2027-02',
  );
  const goal = habit();
  // Sep 2026 and Jul 2027 are outside the range; Nov 2026 is one cent short.
  expect(formatInvestHabitHits(goal, context, 'mo')).toBe('3/9mo');
  expect(getGoalPct(goal, context)).toBeCloseTo((3 / 9) * 100);
  expect(getGoalStatus(goal, context, 2027)).toBe('at_risk');
});

test('on track compares hits with the months that have passed, across a year boundary', () => {
  const goal = habit();
  const hits: Array<[string, number]> = [
    ['2026-10', 500],
    ['2026-11', 500],
    ['2026-12', 500],
  ];
  // January has no buys yet: it is the current month, so it does not count against the habit.
  expect(getGoalStatus(goal, withBuys(baseContext, hits, '2027-01'), 2027)).toBe('on_track');
  // Once January has passed without reaching the target, the habit is behind.
  expect(getGoalStatus(goal, withBuys(baseContext, hits, '2027-02'), 2027)).toBe('at_risk');
  // Before the first month nothing is due.
  expect(getGoalStatus(goal, withBuys(baseContext, [], '2026-09'), 2026)).toBe('on_track');
  const all = [
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
    '2027-02',
    '2027-03',
    '2027-04',
    '2027-05',
    '2027-06',
  ];
  expect(
    getGoalStatus(
      goal,
      withBuys(
        baseContext,
        all.map((month) => [month, 500]),
      ),
      2027,
    ),
  ).toBe('complete');
});

test('stored manual months never count for an invest habit', () => {
  const goal = habit({ monthsCompleted: 6, missedMonths: ['2026-10'], sourceType: 'manual' });
  expect(formatInvestHabitHits(goal, withBuys(baseContext, [['2026-10', 500]]))).toBe('1/9');
});

test('normalizes missing source type to manual', () => {
  const goal = buildGoal({
    sourceType: 'manual',
    sourceId: null,
    currentAmount: 3000,
  });

  expect(resolveGoalCurrentAmount(goal, baseContext)).toMatchObject({
    currentAmount: 3000,
    status: 'manual',
  });
});

test('normalizes missing source type to salary_latest_gross for salary goals', () => {
  const goal = buildGoal({
    type: 'salary',
    sourceType: 'salary_latest_gross',
    sourceId: null,
    currentAmount: 0,
    targetAmount: 120000,
  });

  expect(resolveGoalCurrentAmount(goal, baseContext)).toMatchObject({
    currentAmount: 84000,
    status: 'linked',
    label: 'Year-to-date gross',
  });
});

const fxRates: Record<string, number> = { EUR: 1, AUD: 0.6, GBP: 1.15, USD: 0.92 };
const convertWithRates = (amount: number, from: string) => amount * (fxRates[from] ?? 1);

const fxContext: GoalProgressContext = {
  annualGross: 84000,
  savingsAccounts: [],
  portfolioTotal: 75000,
  netWorth: 200000,
  investHabitBuys: EMPTY_INVEST_HABIT_BUYS,
  currentMonth: '2026-11',
  convertToBase: convertWithRates,
};

test('converts manual currentAmount to base currency', () => {
  const goal = buildGoal({ currency: 'AUD', currentAmount: 5000, targetAmount: 10000 });
  const result = resolveGoalCurrentAmount(goal, fxContext);
  expect(result.currentAmount).toBe(3000);
});

test('converts targetAmount to base currency in percentage calculation', () => {
  const goal = buildGoal({
    currency: 'AUD',
    currentAmount: 3000,
    targetAmount: 10000,
  });
  expect(getGoalPct(goal, fxContext)).toBe(30);
});

test('converts linked savings account goal targetAmount to base', () => {
  const goal = buildGoal({
    currency: 'GBP',
    sourceType: 'savings_account',
    sourceId: 10,
    targetAmount: 10000,
  });
  const context: GoalProgressContext = {
    ...fxContext,
    savingsAccounts: [{ id: 10, name: 'ISA', balance: 5750, currency: 'GBP', archivedAt: null }],
  };
  const resolved = resolveGoalCurrentAmount(goal, context);
  expect(resolved.currentAmount).toBe(5750 * 1.15);
  expect(getGoalPct(goal, context)).toBeCloseTo(((5750 * 1.15) / (10000 * 1.15)) * 100);
});

test('a monthly-limit annual goal above its target is a lower-is-better goal over target', () => {
  const limit = { type: 'annual' as const, unit: 'takeaways/mo', targetAmount: 4 };
  expect(isAboveLowerIsBetterTarget(buildGoal({ ...limit, currentAmount: 6 }))).toBe(true);
  expect(isAboveLowerIsBetterTarget(buildGoal({ ...limit, currentAmount: 4 }))).toBe(false);
  expect(isAboveLowerIsBetterTarget(buildGoal({ ...limit, currentAmount: 2 }))).toBe(false);
  expect(isAboveLowerIsBetterTarget(buildGoal({ ...limit, unit: 'books', currentAmount: 6 }))).toBe(
    false,
  );
  expect(isAboveLowerIsBetterTarget(buildGoal({ currentAmount: 20000 }))).toBe(false);
});
