import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { formatNumber, type Goal, type GoalType } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import type { GoalProgressContext } from '@/features/goals/types';
import { GOAL_TYPE_META } from '@/features/goals/utils/goals-constants';
import {
  getGoalPct,
  normalizeGoalType,
  resolveGoalCurrentAmount,
  resolveInvestHabitMonthsCompleted,
} from '@/features/goals/utils/goal-utils';
import type { CompactFormatFn } from '../types';

const TYPE_BADGE_LABEL: Record<GoalType, string> = {
  savings: 'Savings',
  salary: 'Career',
  invest_habit: 'Habit',
  portfolio: 'Portfolio',
  net_worth: 'Net Worth',
  annual: 'Annual',
};

const TYPE_BADGE_CLASS: Record<GoalType, string> = {
  savings: 'bg-indigo-50 text-indigo-700',
  salary: 'bg-emerald-50 text-emerald-700',
  invest_habit: 'bg-sky-50 text-sky-700',
  portfolio: 'bg-cyan-50 text-cyan-700',
  net_worth: 'bg-pink-50 text-pink-700',
  annual: 'bg-teal-50 text-teal-700',
};

const getAnnualBarColor = (goal: Goal, type: GoalType, clampedPct: number): string => {
  const color = goal.color || '#6366f1';
  if (type !== 'annual') return color;
  const lowerIsBetter =
    Boolean(goal.unit?.endsWith('/mo')) && (goal.currentAmount || 0) > (goal.targetAmount || 0);
  if (lowerIsBetter && clampedPct < 100) return '#f59e0b';
  return color;
};

const buildSalaryValueParts = (
  goal: Goal,
  annualGross: number,
  fmtBase: CompactFormatFn,
  toBase: (n: number) => number,
): { primary: string; secondary: string } => ({
  primary: fmtBase(annualGross),
  secondary: ` \u2192 ${fmtBase(toBase(goal.targetAmount || 0))}`,
});

const buildInvestHabitValueParts = (
  goal: Goal,
  context: GoalProgressContext,
): { primary: string; secondary: string } => ({
  primary: `${resolveInvestHabitMonthsCompleted(goal, context)}/${goal.totalMonths ?? 12}`,
  secondary: ' months',
});

const buildAnnualValueParts = (
  goal: Goal,
  numberFormat: ReturnType<typeof useCurrency>['numberFormat'],
): { primary: string; secondary: string } => {
  const unit = goal.unit ? ` ${goal.unit}` : '';
  return {
    primary: formatNumber(goal.currentAmount || 0, numberFormat, { maximumFractionDigits: 0 }),
    secondary: ` / ${formatNumber(goal.targetAmount || 0, numberFormat, { maximumFractionDigits: 0 })}${unit}`,
  };
};

const buildAmountValueParts = (
  goal: Goal,
  currentAmount: number,
  fmtBase: CompactFormatFn,
  toBase: (n: number) => number,
): { primary: string; secondary: string } => ({
  primary: fmtBase(currentAmount),
  secondary: ` / ${fmtBase(toBase(goal.targetAmount || 0))}`,
});

const buildValueParts = (
  goal: Goal,
  type: GoalType,
  currentAmount: number,
  context: GoalProgressContext,
  fmtBase: CompactFormatFn,
  numberFormat: ReturnType<typeof useCurrency>['numberFormat'],
  toBase: (n: number) => number,
): { primary: string; secondary?: string } => {
  switch (type) {
    case 'salary':
      return buildSalaryValueParts(goal, context.annualGross, fmtBase, toBase);
    case 'invest_habit':
      return buildInvestHabitValueParts(goal, context);
    case 'annual':
      return buildAnnualValueParts(goal, numberFormat);
    default:
      return buildAmountValueParts(goal, currentAmount, fmtBase, toBase);
  }
};

const buildSalarySubtext = (
  goal: Goal,
  annualGross: number,
  toBase: (n: number) => number,
): string => {
  if (annualGross <= 0) return 'Add a payslip to track this goal';
  const raisePct = (toBase(goal.targetAmount || 0) / annualGross - 1) * 100;
  if (raisePct <= 0) return 'Target reached';
  return `+${raisePct.toFixed(1)}% raise needed`;
};

const buildInvestHabitSubtext = (goal: Goal, context: GoalProgressContext): string =>
  `${resolveInvestHabitMonthsCompleted(goal, context)} of ${goal.totalMonths ?? 12} months hit`;

const buildAnnualSubtext = (clampedPct: number): string => `currently ${clampedPct.toFixed(0)}%`;

const buildAmountSubtext = (
  goal: Goal,
  currentAmount: number,
  clampedPct: number,
  fmtBase: CompactFormatFn,
  toBase: (n: number) => number,
): string => {
  const monthlyContrib = toBase(goal.monthlyContribution || 0);
  const remaining = Math.max(0, toBase(goal.targetAmount || 0) - currentAmount);
  if (monthlyContrib > 0 && remaining > 0) {
    const monthsLeft = Math.ceil(remaining / monthlyContrib);
    return `${monthsLeft} months left at ${fmtBase(monthlyContrib)}/mo`;
  }
  return `${clampedPct.toFixed(0)}% complete`;
};

const buildGoalSubtext = (
  goal: Goal,
  type: GoalType,
  currentAmount: number,
  clampedPct: number,
  context: GoalProgressContext,
  fmtBase: CompactFormatFn,
  toBase: (n: number) => number,
): string => {
  const notes = goal.notes.trim();
  if (notes.length > 0) return notes;

  switch (type) {
    case 'salary':
      return buildSalarySubtext(goal, context.annualGross, toBase);
    case 'invest_habit':
      return buildInvestHabitSubtext(goal, context);
    case 'annual':
      return buildAnnualSubtext(clampedPct);
    default:
      return buildAmountSubtext(goal, currentAmount, clampedPct, fmtBase, toBase);
  }
};

function GoalTypePill({ type }: Readonly<{ type: GoalType }>) {
  const { Icon } = GOAL_TYPE_META[type];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE_CLASS[type]}`}
    >
      <Icon size={10} />
      {TYPE_BADGE_LABEL[type]}
    </span>
  );
}

function GoalProgressItem({
  goal,
  goalProgressContext,
  fmtBase,
}: Readonly<{
  goal: Goal;
  goalProgressContext: GoalProgressContext;
  fmtBase: CompactFormatFn;
}>) {
  const { numberFormat, convertToBase } = useCurrency();
  const toBase = (n: number) => convertToBase(n, goal.currency);
  const type = normalizeGoalType(goal);
  const sourceResolution = resolveGoalCurrentAmount(goal, goalProgressContext);
  const pct = getGoalPct(goal, goalProgressContext);
  const clampedPct = Math.max(0, Math.min(pct, 100));
  const barColor = getAnnualBarColor(goal, type, clampedPct);
  const valueParts = buildValueParts(
    goal,
    type,
    sourceResolution.currentAmount,
    goalProgressContext,
    fmtBase,
    numberFormat,
    toBase,
  );
  const subtext =
    sourceResolution.status === 'missing'
      ? 'Linked source unavailable - using saved amount'
      : buildGoalSubtext(
          goal,
          type,
          sourceResolution.currentAmount,
          clampedPct,
          goalProgressContext,
          fmtBase,
          toBase,
        );

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="text-xl leading-none mt-0.5">{goal.emoji}</span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-700 leading-tight truncate">
              {goal.name}
            </p>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <GoalTypePill type={type} />
              <p className="text-xs text-slate-500 truncate">{subtext}</p>
            </div>
          </div>
        </div>
        <p className="text-sm whitespace-nowrap pl-3">
          <span className="font-semibold text-slate-800">{valueParts.primary}</span>
          {valueParts.secondary && <span className="text-slate-400">{valueParts.secondary}</span>}
        </p>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200/80 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${clampedPct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

export function GoalsOverviewCard({
  goals,
  goalProgressContext,
  currentYear,
  fmtBase,
}: Readonly<{
  goals: readonly Goal[];
  goalProgressContext: GoalProgressContext;
  currentYear: number;
  fmtBase: CompactFormatFn;
}>) {
  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-3xl font-semibold text-slate-900">Financial Goals</h3>
          <p className="text-sm text-slate-500 mt-0.5">{currentYear} snapshot</p>
        </div>
        <Link
          to="/goals"
          className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
        >
          View all <ArrowRight size={14} />
        </Link>
      </div>
      {goals.length > 0 ? (
        <div className="space-y-6">
          {goals.map((goal) => (
            <GoalProgressItem
              key={goal.id}
              goal={goal}
              goalProgressContext={goalProgressContext}
              fmtBase={fmtBase}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">
          No goals yet.{' '}
          <Link to="/goals" className="text-indigo-500">
            Create one
          </Link>
        </p>
      )}
    </div>
  );
}
