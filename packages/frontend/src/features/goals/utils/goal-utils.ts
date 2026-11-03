import {
  countGoalMonths,
  formatGoalMonth,
  GOAL_SOURCE_TYPES,
  goalStartEndMonths,
  monthKeyOfDate,
  parseGoalMonth,
  type Goal,
  type GoalSourceType,
  type GoalType,
} from '@quro/shared';
import type { CreateGoalInput, GoalFormState, GoalProgressContext, GoalStatus } from '../types';
import { computeInvestHabitProgress, type InvestHabitProgress } from './invest-habit';

const DEFAULT_GOAL_TYPE: GoalType = 'savings';
const TYPE_VALUES: GoalType[] = [
  'savings',
  'salary',
  'invest_habit',
  'portfolio',
  'net_worth',
  'annual',
];

type GoalSourceStatus = 'manual' | 'linked' | 'missing';

export type GoalCurrentAmountResolution = {
  currentAmount: number;
  sourceType: GoalSourceType;
  status: GoalSourceStatus;
  label: string | null;
};

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

/**
 * The years a goal shows in: every year from its start month to its deadline when it has a start
 * month, otherwise its one year.
 */
export const getGoalYears = (goal: Goal, fallbackYear: number): number[] => {
  const range = goalStartEndMonths(goal);
  if (!range) return [parseGoalYear(goal, fallbackYear)];
  const years: number[] = [];
  for (let year = range.start.year; year <= range.end.year; year += 1) years.push(year);
  return years;
};

export const goalCoversYear = (goal: Goal, year: number, fallbackYear: number): boolean =>
  getGoalYears(goal, fallbackYear).includes(year);

export const normalizeGoalType = (goal: Goal): GoalType => {
  if (goal.type && TYPE_VALUES.includes(goal.type)) return goal.type;
  return DEFAULT_GOAL_TYPE;
};

const normalizeGoalSourceType = (goal: Goal): GoalSourceType => {
  if (goal.sourceType && GOAL_SOURCE_TYPES.includes(goal.sourceType)) return goal.sourceType;
  return normalizeGoalType(goal) === 'salary' ? 'salary_latest_gross' : 'manual';
};

const findSavingsAccountSource = (goal: Goal, context: GoalProgressContext) => {
  if (goal.sourceId == null) return null;
  return context.savingsAccounts.find((account) => account.id === goal.sourceId) ?? null;
};

export const resolveGoalCurrentAmount = (
  goal: Goal,
  context: GoalProgressContext,
): GoalCurrentAmountResolution => {
  const sourceType = normalizeGoalSourceType(goal);
  if (sourceType === 'salary_latest_gross') {
    return {
      currentAmount: context.annualGross,
      sourceType,
      status: 'linked',
      label: 'Year-to-date gross',
    };
  }

  if (sourceType === 'savings_account') {
    const account = findSavingsAccountSource(goal, context);
    if (!account) {
      return {
        currentAmount: context.convertToBase(goal.currentAmount || 0, goal.currency),
        sourceType,
        status: 'missing',
        label: 'Linked savings account unavailable',
      };
    }

    return {
      currentAmount: context.convertToBase(account.balance, account.currency),
      sourceType,
      status: 'linked',
      label: account.name,
    };
  }

  if (sourceType === 'portfolio_total') {
    return {
      currentAmount: context.portfolioTotal,
      sourceType,
      status: 'linked',
      label: 'Portfolio value',
    };
  }

  if (sourceType === 'net_worth_total') {
    return {
      currentAmount: context.netWorth,
      sourceType,
      status: 'linked',
      label: 'Net worth',
    };
  }

  return {
    currentAmount: context.convertToBase(goal.currentAmount || 0, goal.currency),
    sourceType: 'manual',
    status: 'manual',
    label: null,
  };
};

const getAmountBasedPct = (current: number, target: number): number => {
  if (target <= 0) return 0;
  return Math.min((current / target) * 100, 100);
};

const getAnnualPct = (goal: Goal): number => {
  const value = goal.currentAmount || 0;
  const target = goal.targetAmount || 0;
  if (target <= 0) return 0;
  if (goal.unit?.endsWith('/mo') && value > target) {
    return Math.max(100 - ((value - target) / target) * 100, 0);
  }
  return Math.min((value / target) * 100, 100);
};

/**
 * An annual goal counted per month against a limit (its unit ends in "/mo", such as
 * "takeaways/mo") is a "lower is better" goal; this is true while it is still above its target.
 */
export const isAboveLowerIsBetterTarget = (goal: Goal): boolean =>
  normalizeGoalType(goal) === 'annual' &&
  Boolean(goal.unit?.endsWith('/mo')) &&
  (goal.currentAmount || 0) > (goal.targetAmount || 0);

export const getInvestHabitProgress = (
  goal: Goal,
  context: GoalProgressContext,
): InvestHabitProgress =>
  computeInvestHabitProgress(
    goal,
    context.investHabitBuys,
    context.convertToBase,
    context.currentMonth,
  );

/** "4/9" months hit, with a unit after it. */
export const formatInvestHabitHits = (
  goal: Goal,
  context: GoalProgressContext,
  unit = '',
): string => {
  const { hits, months } = getInvestHabitProgress(goal, context);
  return `${hits}/${months.length}${unit}`;
};

const getInvestHabitPct = (goal: Goal, context: GoalProgressContext): number => {
  const { hits, months } = getInvestHabitProgress(goal, context);
  if (months.length === 0) return 0;
  return Math.min((hits / months.length) * 100, 100);
};

export const getGoalPct = (goal: Goal, context: GoalProgressContext): number => {
  const type = normalizeGoalType(goal);
  const targetInBase = context.convertToBase(goal.targetAmount || 0, goal.currency);
  if (type === 'savings' || type === 'portfolio' || type === 'net_worth') {
    return getAmountBasedPct(resolveGoalCurrentAmount(goal, context).currentAmount, targetInBase);
  }
  if (type === 'annual') return getAnnualPct(goal);
  if (type === 'salary') {
    return getAmountBasedPct(resolveGoalCurrentAmount(goal, context).currentAmount, targetInBase);
  }
  if (type === 'invest_habit') return getInvestHabitPct(goal, context);
  return 0;
};

const getExpectedProgress = (year: number, currentYear: number): number => {
  if (year < currentYear) return 100;
  if (year > currentYear) return 0;
  return ((new Date().getMonth() + 1) / 12) * 100;
};

export const getGoalStatus = (
  goal: Goal,
  context: GoalProgressContext,
  currentYear: number,
): GoalStatus => {
  const pct = getGoalPct(goal, context);
  if (pct >= 100) return 'complete';
  if (normalizeGoalType(goal) === 'salary') return 'pending';
  // A habit is on track while every month of its range that has passed was hit.
  if (normalizeGoalType(goal) === 'invest_habit') {
    return getInvestHabitProgress(goal, context).behind ? 'at_risk' : 'on_track';
  }
  const year = parseGoalYear(goal, currentYear);
  const expectedProgress = getExpectedProgress(year, currentYear);
  return pct >= expectedProgress ? 'on_track' : 'at_risk';
};

const buildSavingsPayload = (base: CreateGoalInput, form: GoalFormState): CreateGoalInput => {
  const sourceId = Number.parseInt(form.sourceId, 10);
  if (Number.isInteger(sourceId) && sourceId > 0) {
    base.sourceType = 'savings_account';
    base.sourceId = sourceId;
    base.currentAmount = Number.parseFloat(form.current) || 0;
  } else {
    base.sourceType = 'manual';
    base.sourceId = null;
    base.currentAmount = Number.parseFloat(form.current) || 0;
  }
  base.targetAmount = Number.parseFloat(form.target) || 0;
  base.monthlyContribution = Number.parseFloat(form.monthlyContrib) || 0;
  return base;
};

const buildPortfolioOrNetWorthPayload = (
  type: GoalType,
  base: CreateGoalInput,
  form: GoalFormState,
): CreateGoalInput => {
  base.sourceType = type === 'portfolio' ? 'portfolio_total' : 'net_worth_total';
  base.sourceId = null;
  base.currentAmount = 0;
  base.targetAmount = Number.parseFloat(form.target) || 0;
  return base;
};

const buildSalaryPayload = (base: CreateGoalInput, form: GoalFormState): CreateGoalInput => {
  base.sourceType = 'salary_latest_gross';
  base.sourceId = null;
  base.targetAmount = Number.parseFloat(form.target) || 0;
  return base;
};

export type InvestHabitFormRange = { months: number; error: string | null };

/** The months between an invest habit form's start and end months, or why they do not work. */
export const getInvestHabitFormRange = (
  form: Pick<GoalFormState, 'startMonth' | 'deadline'>,
): InvestHabitFormRange => {
  const start = parseGoalMonth(monthKeyOfDate(form.startMonth));
  if (!start) return { months: 0, error: 'Choose a start month' };
  const end = parseGoalMonth(form.deadline);
  if (!end) return { months: 0, error: 'Choose an end month' };
  const months = countGoalMonths(start, end);
  return months > 0
    ? { months, error: null }
    : { months: 0, error: 'The start month is after the end month' };
};

const buildInvestHabitPayload = (base: CreateGoalInput, form: GoalFormState): CreateGoalInput => {
  base.sourceType = 'invest_habit_buys';
  base.sourceId = null;
  base.monthlyTarget = Number.parseFloat(form.monthlyTarget) || 0;
  // Its months come from investment buys, never from the form.
  base.monthsCompleted = null;
  base.missedMonths = null;

  const start = parseGoalMonth(monthKeyOfDate(form.startMonth));
  const end = parseGoalMonth(base.deadline);
  base.startMonth = start ? formatGoalMonth(start) : null;
  base.totalMonths = start && end ? countGoalMonths(start, end) : null;
  if (end) base.year = end.year;

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
    return buildPortfolioOrNetWorthPayload(type, base, form);
  }
  if (type === 'salary') return buildSalaryPayload(base, form);
  if (type === 'invest_habit') return buildInvestHabitPayload(base, form);
  if (type === 'annual') return buildAnnualPayload(base, form);
  return base;
};
