import { Link } from 'react-router';
import { formatNumber, type Goal, type GoalType, formatPercent } from '@quro/shared';
import { Badge, Card, PanelHeader, ProgressMeter } from '@/components/ui';
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
  net_worth: 'Net worth',
  annual: 'Annual',
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
  numberFormat: ReturnType<typeof useCurrency>['numberFormat'],
): string => {
  if (annualGross <= 0) return 'Add a payslip to track this goal';
  const raisePct = (toBase(goal.targetAmount || 0) / annualGross - 1) * 100;
  if (raisePct <= 0) return 'Target reached';
  return `+${formatPercent(raisePct, numberFormat, 1)} raise needed`;
};

const buildInvestHabitSubtext = (goal: Goal, context: GoalProgressContext): string =>
  `${resolveInvestHabitMonthsCompleted(goal, context)} of ${goal.totalMonths ?? 12} months hit`;

const buildAnnualSubtext = (
  clampedPct: number,
  numberFormat: ReturnType<typeof useCurrency>['numberFormat'],
): string => `currently ${formatPercent(clampedPct, numberFormat, 0)}`;

const buildAmountSubtext = (
  goal: Goal,
  currentAmount: number,
  clampedPct: number,
  fmtBase: CompactFormatFn,
  toBase: (n: number) => number,
  numberFormat: ReturnType<typeof useCurrency>['numberFormat'],
): string => {
  const monthlyContrib = toBase(goal.monthlyContribution || 0);
  const remaining = Math.max(0, toBase(goal.targetAmount || 0) - currentAmount);
  if (monthlyContrib > 0 && remaining > 0) {
    const monthsLeft = Math.ceil(remaining / monthlyContrib);
    return `${monthsLeft} months left at ${fmtBase(monthlyContrib)}/mo`;
  }
  return `${formatPercent(clampedPct, numberFormat, 0)} complete`;
};

const buildGoalSubtext = (
  goal: Goal,
  type: GoalType,
  currentAmount: number,
  clampedPct: number,
  context: GoalProgressContext,
  fmtBase: CompactFormatFn,
  toBase: (n: number) => number,
  numberFormat: ReturnType<typeof useCurrency>['numberFormat'],
): string => {
  const notes = goal.notes.trim();
  if (notes.length > 0) return notes;

  switch (type) {
    case 'salary':
      return buildSalarySubtext(goal, context.annualGross, toBase, numberFormat);
    case 'invest_habit':
      return buildInvestHabitSubtext(goal, context);
    case 'annual':
      return buildAnnualSubtext(clampedPct, numberFormat);
    default:
      return buildAmountSubtext(goal, currentAmount, clampedPct, fmtBase, toBase, numberFormat);
  }
};

function GoalTypePill({ type }: Readonly<{ type: GoalType }>) {
  const { Icon } = GOAL_TYPE_META[type];
  return (
    <Badge size="xs" className="shrink-0">
      <Icon size={10} aria-hidden />
      {TYPE_BADGE_LABEL[type]}
    </Badge>
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
          numberFormat,
        );

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-start gap-2">
        <span className="text-body leading-5" aria-hidden>
          {goal.emoji}
        </span>
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-fg">{goal.name}</p>
          <div className="flex min-w-0 items-center gap-1.5">
            <GoalTypePill type={type} />
            <p className="truncate text-caption text-fg-subtle">{subtext}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ProgressMeter value={clampedPct} label={goal.name} className="min-w-0 flex-1" />
        <p className="shrink-0 whitespace-nowrap text-figure-md font-numeric">
          <span className="text-fg">{valueParts.primary}</span>
          {valueParts.secondary && <span className="text-fg-subtle">{valueParts.secondary}</span>}
        </p>
      </div>
      <p className="text-caption font-numeric text-fg-muted">
        {formatPercent(clampedPct, numberFormat, 0)}
      </p>
    </li>
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
    <Card padding="none" className="overflow-hidden">
      <PanelHeader
        title="Financial goals"
        subtitle={`${currentYear} snapshot`}
        action={
          <Link
            to="/goals"
            className="rounded-sm text-cell font-medium text-brand transition-colors duration-fast hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
          >
            View all
          </Link>
        }
      />
      <div className="p-4">
        {goals.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {goals.map((goal) => (
              <GoalProgressItem
                key={goal.id}
                goal={goal}
                goalProgressContext={goalProgressContext}
                fmtBase={fmtBase}
              />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-cell text-fg-subtle">
            No goals yet.{' '}
            <Link
              to="/goals"
              className="rounded-sm text-brand hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
            >
              Create one
            </Link>
          </p>
        )}
      </div>
    </Card>
  );
}
