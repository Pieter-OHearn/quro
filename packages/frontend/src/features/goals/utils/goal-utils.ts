import type { Goal, GoalType } from '@quro/shared';
import type { CreateGoalInput, GoalFormState, GoalStatus } from '../types';

const DEFAULT_GOAL_TYPE: GoalType = 'savings';
const TYPE_VALUES: GoalType[] = [
  'savings',
  'salary',
  'invest_habit',
  'portfolio',
  'net_worth',
  'annual',
];

export const parseGoalYear = (goal: Goal, fallbackYear: number): number => {
  if (typeof goal.year === 'number' && Number.isFinite(goal.year)) {
    return Math.trunc(goal.year);
  }
  const match = goal.deadline?.match(/\b(19|20)\d{2}\b/);
  if (match) {
    const parsed = Number(match[0]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallbackYear;
};

export const normalizeGoalType = (goal: Goal): GoalType => {
  if (goal.type && TYPE_VALUES.includes(goal.type)) return goal.type;
  return DEFAULT_GOAL_TYPE;
};

const getAmountBasedPct = (current: number, target: number): number => {
  if (target <= 0) return 0;
  return Math.min((current / target) * 100, 100);
};

const getAnnualPct = (goal: Goal): number => {
  const value = goal.currentAmount || 0;
  const target = goal.targetAmount || 0;
  if (target <= 0) return 0;
  if (goal.unit === '€/mo' && value > target) {
    return Math.max(100 - ((value - target) / target) * 100, 0);
  }
  return Math.min((value / target) * 100, 100);
};

const getInvestHabitPct = (goal: Goal): number => {
  const totalMonths = goal.totalMonths ?? 12;
  if (totalMonths <= 0) return 0;
  return Math.min(((goal.monthsCompleted ?? 0) / totalMonths) * 100, 100);
};

export const getGoalPct = (goal: Goal, annualGross: number): number => {
  const type = normalizeGoalType(goal);
  if (type === 'savings' || type === 'portfolio' || type === 'net_worth') {
    return getAmountBasedPct(goal.currentAmount || 0, goal.targetAmount || 0);
  }
  if (type === 'annual') return getAnnualPct(goal);
  if (type === 'salary') return getAmountBasedPct(annualGross, goal.targetAmount || 0);
  if (type === 'invest_habit') return getInvestHabitPct(goal);
  return 0;
};

const getExpectedProgress = (year: number, currentYear: number): number => {
  if (year < currentYear) return 100;
  if (year > currentYear) return 0;
  return ((new Date().getMonth() + 1) / 12) * 100;
};

export const getGoalStatus = (goal: Goal, annualGross: number, currentYear: number): GoalStatus => {
  const pct = getGoalPct(goal, annualGross);
  if (pct >= 100) return 'complete';
  if (normalizeGoalType(goal) === 'salary') return 'pending';
  const year = parseGoalYear(goal, currentYear);
  const expectedProgress = getExpectedProgress(year, currentYear);
  return pct >= expectedProgress ? 'on_track' : 'at_risk';
};

const buildSavingsPayload = (base: CreateGoalInput, form: GoalFormState): CreateGoalInput => {
  base.currentAmount = Number.parseFloat(form.current) || 0;
  base.targetAmount = Number.parseFloat(form.target) || 0;
  base.monthlyContribution = Number.parseFloat(form.monthlyContrib) || 0;
  return base;
};

const buildPortfolioOrNetWorthPayload = (
  base: CreateGoalInput,
  form: GoalFormState,
): CreateGoalInput => {
  base.currentAmount = Number.parseFloat(form.current) || 0;
  base.targetAmount = Number.parseFloat(form.target) || 0;
  return base;
};

const buildSalaryPayload = (base: CreateGoalInput, form: GoalFormState): CreateGoalInput => {
  base.targetAmount = Number.parseFloat(form.target) || 0;
  return base;
};

const buildInvestHabitPayload = (base: CreateGoalInput, form: GoalFormState): CreateGoalInput => {
  base.monthlyTarget = Number.parseFloat(form.monthlyTarget) || 0;
  base.monthsCompleted = 0;
  base.totalMonths = Number.parseInt(form.totalMonths, 10) || 12;
  return base;
};

const buildAnnualPayload = (base: CreateGoalInput, form: GoalFormState): CreateGoalInput => {
  base.currentAmount = Number.parseFloat(form.current) || 0;
  base.targetAmount = Number.parseFloat(form.target) || 0;
  base.unit = form.unit || null;
  return base;
};

export const buildGoalPayload = (
  type: GoalType,
  base: CreateGoalInput,
  form: GoalFormState,
): CreateGoalInput => {
  if (type === 'savings') return buildSavingsPayload(base, form);
  if (type === 'portfolio' || type === 'net_worth') {
    return buildPortfolioOrNetWorthPayload(base, form);
  }
  if (type === 'salary') return buildSalaryPayload(base, form);
  if (type === 'invest_habit') return buildInvestHabitPayload(base, form);
  if (type === 'annual') return buildAnnualPayload(base, form);
  return base;
};
