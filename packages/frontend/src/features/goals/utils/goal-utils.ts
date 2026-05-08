import { GOAL_SOURCE_TYPES, type Goal, type GoalSourceType, type GoalType } from '@quro/shared';
import type { CreateGoalInput, GoalFormState, GoalProgressContext, GoalStatus } from '../types';

const DEFAULT_GOAL_TYPE: GoalType = 'savings';
const TYPE_VALUES: GoalType[] = [
  'savings',
  'salary',
  'invest_habit',
  'portfolio',
  'net_worth',
  'annual',
];

export type GoalSourceStatus = 'manual' | 'linked' | 'missing';

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

export const normalizeGoalType = (goal: Goal): GoalType => {
  if (goal.type && TYPE_VALUES.includes(goal.type)) return goal.type;
  return DEFAULT_GOAL_TYPE;
};

export const normalizeGoalSourceType = (goal: Goal): GoalSourceType => {
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

export const resolveInvestHabitMonthsCompleted = (
  goal: Goal,
  context: GoalProgressContext,
): number => {
  const sourceType = normalizeGoalSourceType(goal);
  if (sourceType !== 'invest_habit_buys') return goal.monthsCompleted ?? 0;
  const year = parseGoalYear(goal, new Date().getFullYear());
  const months = context.investHabitBuyMonths.get(year);
  return months ? months.size : 0;
};

const getInvestHabitPct = (goal: Goal, context: GoalProgressContext): number => {
  const totalMonths = goal.totalMonths ?? 12;
  if (totalMonths <= 0) return 0;
  const monthsCompleted = resolveInvestHabitMonthsCompleted(goal, context);
  return Math.min((monthsCompleted / totalMonths) * 100, 100);
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

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function deadlineStringToYearMonth(deadline: string): { year: number; month: number } | null {
  const match = deadline.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const month = monthNames.indexOf(match[1]);
  if (month === -1) return null;
  return { year: Number(match[2]), month };
}

function monthsBetweenDeadlines(startDeadline: string, endDeadline: string): number {
  const start = deadlineStringToYearMonth(startDeadline);
  const end = deadlineStringToYearMonth(endDeadline);
  if (!start || !end) return 12;
  return Math.max(1, (end.year - start.year) * 12 + (end.month - start.month) + 1);
}

function dateStringToDeadline(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00Z');
  const month = monthNames[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${month} ${year}`;
}

const buildInvestHabitPayload = (base: CreateGoalInput, form: GoalFormState): CreateGoalInput => {
  base.sourceType = 'invest_habit_buys';
  base.sourceId = null;
  base.monthlyTarget = Number.parseFloat(form.monthlyTarget) || 0;
  base.monthsCompleted = base.monthsCompleted ?? 0;

  const startDeadline = form.startMonth ? dateStringToDeadline(form.startMonth) : null;
  base.startMonth = startDeadline;

  if (startDeadline && base.deadline) {
    base.totalMonths = monthsBetweenDeadlines(startDeadline, base.deadline);
  } else {
    base.totalMonths = Number.parseInt(form.totalMonths, 10) || 12;
  }

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
