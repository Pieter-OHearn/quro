import type { Goal, GoalType } from '@quro/shared';
import type { ApiGoal } from '../types';

const GOAL_TYPES: GoalType[] = [
  'savings',
  'salary',
  'invest_habit',
  'portfolio',
  'net_worth',
  'annual',
];

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toNullableInteger = (value: number | string | null | undefined): number | null => {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
};

const inferYearFromDeadline = (deadline: string | null | undefined): number | null => {
  if (!deadline) return null;
  const match = deadline.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeGoalTypeValue = (value: GoalType | string | null | undefined): GoalType => {
  if (!value) return 'savings';
  return GOAL_TYPES.includes(value as GoalType) ? (value as GoalType) : 'savings';
};

const resolveGoalYear = (goal: ApiGoal): number =>
  toNullableInteger(goal.year) ?? inferYearFromDeadline(goal.deadline) ?? new Date().getFullYear();

const resolveMonthlyTarget = (value: ApiGoal['monthlyTarget']): number | null =>
  value == null ? null : toNumber(value);

const normalizeGoalMeta = (goal: ApiGoal) => ({
  type: normalizeGoalTypeValue(goal.type),
  name: goal.name?.trim() || 'Untitled Goal',
  emoji: goal.emoji || '🎯',
  deadline: goal.deadline?.trim() || 'TBD',
  category: goal.category?.trim() || 'Other',
});

const normalizeGoalDisplay = (goal: ApiGoal) => ({
  unit: goal.unit ?? null,
  color: goal.color || '#6366f1',
  notes: goal.notes || '',
  currency: goal.currency || 'EUR',
});

const normalizeGoalNumbers = (goal: ApiGoal) => ({
  currentAmount: toNumber(goal.currentAmount),
  targetAmount: toNumber(goal.targetAmount),
  year: resolveGoalYear(goal),
  monthlyContribution: toNumber(goal.monthlyContribution),
  monthlyTarget: resolveMonthlyTarget(goal.monthlyTarget),
  monthsCompleted: toNullableInteger(goal.monthsCompleted),
  totalMonths: toNullableInteger(goal.totalMonths),
});

export const normalizeGoal = (goal: ApiGoal): Goal => ({
  ...goal,
  ...normalizeGoalMeta(goal),
  ...normalizeGoalDisplay(goal),
  ...normalizeGoalNumbers(goal),
});
