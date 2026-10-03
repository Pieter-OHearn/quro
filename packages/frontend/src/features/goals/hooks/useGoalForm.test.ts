/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import type { Goal, GoalType } from '@quro/shared';
import type { GoalFormState } from '../types';
import { buildGoalFormBase } from './useGoalForm';
import { buildGoalPayload } from '../utils/goal-utils';
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
test('editing keeps investment progress while retaining the existing automatic payload rules', () => {
  const goal: Goal = {
    id: 7,
    ...buildGoalFormBase('invest_habit', form, 'EUR'),
    sourceType: 'manual',
    sourceId: 42,
    monthsCompleted: 4,
    missedMonths: '2026-02',
  };
  const base = buildGoalFormBase('invest_habit', { ...form, currency: 'CHF' }, 'EUR', goal);
  const payload = buildGoalPayload('invest_habit', base, form);
  expect(payload.sourceType).toBe('invest_habit_buys');
  expect(payload.sourceId).toBeNull();
  expect(payload.monthsCompleted).toBe(4);
  expect(payload.missedMonths).toBe('2026-02');
  expect(base.currency).toBe('CHF');
});
