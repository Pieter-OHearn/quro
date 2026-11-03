/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import type { Goal, GoalType } from '@quro/shared';
import type { GoalFormState } from '../types';
import { buildGoalFormBase } from './useGoalForm';
import { buildGoalPayload, getInvestHabitFormRange } from '../utils/goal-utils';
const form: GoalFormState = {
  name: ' Goal ',
  emoji: '🎯',
  color: '#123456',
  notes: 'Notes',
  deadline: 'Dec 2026',
  year: '2026',
  current: '20',
  target: '100',
  monthlyContrib: '10',
  monthlyTarget: '30',
  totalMonths: '12',
  unit: '',
  sourceId: '',
  startMonth: '2026-01-01',
  currency: '',
};
test('new goals retain each automatic source and the currency fallback', () => {
  const sources: Partial<Record<GoalType, Goal['sourceType']>> = {
    salary: 'salary_latest_gross',
    portfolio: 'portfolio_total',
    net_worth: 'net_worth_total',
    invest_habit: 'invest_habit_buys',
  };
  for (const type of [
    'savings',
    'salary',
    'portfolio',
    'net_worth',
    'invest_habit',
    'annual',
  ] as const) {
    const base = buildGoalFormBase(type, form, 'EUR');
    expect(base.sourceType).toBe(sources[type] ?? 'manual');
    expect(base.name).toBe('Goal');
    expect(base.currency).toBe('EUR');
    expect(base.monthsCompleted).toBeNull();
  }
});
test('editing an invest habit sends no manual months and keeps the automatic payload rules', () => {
  const goal: Goal = {
    id: 7,
    ...buildGoalFormBase('invest_habit', form, 'EUR'),
    sourceType: 'manual',
    sourceId: 42,
    monthsCompleted: 4,
    missedMonths: ['2026-02'],
  };
  const range = { ...form, startMonth: '2026-10-01', deadline: 'Jun 2027' };
  const base = buildGoalFormBase('invest_habit', { ...range, currency: 'CHF' }, 'EUR', goal);
  const payload = buildGoalPayload('invest_habit', base, range);
  expect(payload.sourceType).toBe('invest_habit_buys');
  expect(payload.sourceId).toBeNull();
  expect(payload.monthsCompleted).toBeNull();
  expect(payload.missedMonths).toBeNull();
  expect(payload.startMonth).toBe('Oct 2026');
  expect(payload.totalMonths).toBe(9);
  expect(payload.year).toBe(2027);
  expect(base.currency).toBe('CHF');
});

test('editing another goal keeps its stored progress fields', () => {
  const goal: Goal = {
    id: 8,
    ...buildGoalFormBase('annual', form, 'EUR'),
    monthsCompleted: 4,
  };
  expect(buildGoalFormBase('annual', form, 'EUR', goal).monthsCompleted).toBe(4);
});

test('an invest habit range needs a start and an end month, in order', () => {
  expect(getInvestHabitFormRange({ startMonth: '2026-10-01', deadline: 'Jun 2027' })).toEqual({
    months: 9,
    error: null,
  });
  expect(getInvestHabitFormRange({ startMonth: '2027-06-01', deadline: 'Jun 2027' }).months).toBe(
    1,
  );
  expect(getInvestHabitFormRange({ startMonth: '', deadline: 'Jun 2027' }).error).toBe(
    'Choose a start month',
  );
  expect(getInvestHabitFormRange({ startMonth: '2026-10-01', deadline: '' }).error).toBe(
    'Choose an end month',
  );
  expect(getInvestHabitFormRange({ startMonth: '2027-07-01', deadline: 'Jun 2027' }).error).toBe(
    'The start month is after the end month',
  );
  expect(getInvestHabitFormRange({ startMonth: '2017-07-01', deadline: 'Jun 2027' }).error).toBe(
    null,
  );
  expect(getInvestHabitFormRange({ startMonth: '2017-06-01', deadline: 'Jun 2027' }).error).toBe(
    'The range is longer than 120 months',
  );
});
