import type { Goal, GoalType } from '@quro/shared';

type ApiGoal = Omit<
  Goal,
  | 'type'
  | 'currentAmount'
  | 'targetAmount'
  | 'year'
  | 'monthlyContribution'
  | 'monthlyTarget'
  | 'monthsCompleted'
  | 'totalMonths'
> & {
  type?: GoalType | string | null;
  currentAmount: number | string;
  targetAmount: number | string;
  year?: number | string | null;
  monthlyContribution: number | string;
  monthlyTarget?: number | string | null;
  monthsCompleted?: number | string | null;
  totalMonths?: number | string | null;
};

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

const normalizeGoalType = (value: GoalType | string | null | undefined): GoalType => {
  if (!value) return 'savings';
  return GOAL_TYPES.includes(value as GoalType) ? (value as GoalType) : 'savings';
};

export const normalizeGoal = (goal: ApiGoal): Goal => ({
  ...goal,
  type: normalizeGoalType(goal.type),
  currentAmount: toNumber(goal.currentAmount),
  targetAmount: toNumber(goal.targetAmount),
  year: toNullableInteger(goal.year),
  monthlyContribution: toNumber(goal.monthlyContribution),
  monthlyTarget: goal.monthlyTarget == null ? null : toNumber(goal.monthlyTarget),
  monthsCompleted: toNullableInteger(goal.monthsCompleted),
  totalMonths: toNullableInteger(goal.totalMonths),
  unit: goal.unit ?? null,
  color: goal.color || '#6366f1',
  notes: goal.notes || '',
  category: goal.category || 'Other',
  emoji: goal.emoji || '🎯',
  deadline: goal.deadline || 'TBD',
  currency: goal.currency || 'EUR',
});

export type { ApiGoal };
