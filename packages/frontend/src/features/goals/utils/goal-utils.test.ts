/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Goal } from '@quro/shared';
import type { GoalProgressContext } from '../types';
import {
  getGoalPct,
  resolveGoalCurrentAmount,
  resolveInvestHabitMonthsCompleted,
} from './goal-utils';

const convertToBase = (amount: number, _currency: string) => amount;

const baseContext: GoalProgressContext = {
  annualGross: 84000,
  savingsAccounts: [],
  portfolioTotal: 75000,
  netWorth: 200000,
  investHabitBuyMonths: new Map(),
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

test('resolves invest_habit months from buy transaction data', () => {
  const goal = buildGoal({
    type: 'invest_habit',
    sourceType: 'invest_habit_buys',
    year: 2026,
    monthsCompleted: 0,
    totalMonths: 12,
    monthlyTarget: 500,
  });

  const context: GoalProgressContext = {
    ...baseContext,
    investHabitBuyMonths: new Map([[2026, new Set(['2026-01', '2026-02', '2026-03', '2026-05'])]]),
  };

  expect(resolveInvestHabitMonthsCompleted(goal, context)).toBe(4);
  expect(getGoalPct(goal, context)).toBeCloseTo((4 / 12) * 100);
});

test('returns zero months for invest_habit_buys with no buy data for the year', () => {
  const goal = buildGoal({
    type: 'invest_habit',
    sourceType: 'invest_habit_buys',
    year: 2026,
    monthsCompleted: 0,
    totalMonths: 12,
    monthlyTarget: 500,
  });

  expect(resolveInvestHabitMonthsCompleted(goal, baseContext)).toBe(0);
  expect(getGoalPct(goal, baseContext)).toBe(0);
});

test('falls back to stored monthsCompleted for manual invest_habit goals', () => {
  const goal = buildGoal({
    type: 'invest_habit',
    sourceType: 'manual',
    monthsCompleted: 6,
    totalMonths: 12,
    monthlyTarget: 500,
  });

  expect(resolveInvestHabitMonthsCompleted(goal, baseContext)).toBe(6);
  expect(getGoalPct(goal, baseContext)).toBe(50);
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
  investHabitBuyMonths: new Map(),
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
