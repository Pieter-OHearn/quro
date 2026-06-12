import { GOAL_SOURCE_TYPES, type Goal, type GoalSourceType, type GoalType } from '@quro/shared';

const GOAL_TYPES: GoalType[] = [
  'savings',
  'salary',
  'invest_habit',
  'portfolio',
  'net_worth',
  'annual',
];

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

const normalizeGoalSourceTypeValue = (
  value: GoalSourceType | string | null | undefined,
  type: GoalType,
): GoalSourceType => {
  if (!value) return type === 'salary' ? 'salary_latest_gross' : 'manual';
  return GOAL_SOURCE_TYPES.includes(value as GoalSourceType) ? (value as GoalSourceType) : 'manual';
};

const resolveGoalYear = (goal: Goal): number =>
  goal.year ?? inferYearFromDeadline(goal.deadline) ?? new Date().getFullYear();

const normalizeGoalMeta = (goal: Goal) => ({
  type: normalizeGoalTypeValue(goal.type),
  name: goal.name?.trim() || 'Untitled Goal',
  emoji: goal.emoji || '🎯',
  deadline: goal.deadline?.trim() || 'TBD',
  category: goal.category?.trim() || 'Other',
});

const normalizeGoalDisplay = (goal: Goal) => ({
  unit: goal.unit ?? null,
  color: goal.color || '#6366f1',
  notes: goal.notes || '',
  currency: goal.currency || 'EUR',
});

export const normalizeGoal = (goal: Goal): Goal => ({
  ...goal,
  ...normalizeGoalMeta(goal),
  sourceType: normalizeGoalSourceTypeValue(goal.sourceType, normalizeGoalTypeValue(goal.type)),
  sourceId: toNullableInteger(goal.sourceId),
  ...normalizeGoalDisplay(goal),
  year: resolveGoalYear(goal),
});
