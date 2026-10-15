import { formatPercent, type Goal } from '@quro/shared';
import { Badge, Card, PanelHeader, ProgressMeter } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import type { GoalProgressContext } from '../types';
import { STATUS_META } from '../utils/goals-constants';
import {
  getGoalPct,
  getGoalStatus,
  normalizeGoalType,
  resolveInvestHabitMonthsCompleted,
} from '../utils/goal-utils';

type GlanceItemProps = {
  goal: Goal;
  goalProgressContext: GoalProgressContext;
  currentYear: number;
};

function GlanceItem({ goal, goalProgressContext, currentYear }: Readonly<GlanceItemProps>) {
  const { numberFormat } = useCurrency();
  const pct = getGoalPct(goal, goalProgressContext);
  const status = getGoalStatus(goal, goalProgressContext, currentYear);
  const type = normalizeGoalType(goal);

  return (
    <div className="flex items-center gap-2">
      <span className="w-5 shrink-0 text-center text-base leading-none" aria-hidden>
        {goal.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-cell text-fg">{goal.name}</span>
          <span className="shrink-0 text-cell font-medium font-numeric text-fg">
            {type === 'invest_habit'
              ? `${resolveInvestHabitMonthsCompleted(goal, goalProgressContext)}/${goal.totalMonths ?? 12}mo`
              : formatPercent(pct, numberFormat, 0)}
          </span>
        </div>
        <ProgressMeter value={pct} label={`${goal.name} progress`} />
      </div>
      <Badge size="sm" tone={STATUS_META[status].tone} className="shrink-0">
        {STATUS_META[status].label}
      </Badge>
    </div>
  );
}

type GoalsGlanceProps = {
  yearGoals: readonly Goal[];
  goalProgressContext: GoalProgressContext;
  currentYear: number;
  activeYear: number;
};

export function GoalsGlance({
  yearGoals,
  goalProgressContext,
  currentYear,
  activeYear,
}: Readonly<GoalsGlanceProps>) {
  return (
    <Card padding="none">
      <PanelHeader
        title={`${activeYear} Goals at a Glance`}
        subtitle="All goals sorted by progress"
      />
      <div className="space-y-3 p-4">
        {[...yearGoals]
          .sort((a, b) => getGoalPct(b, goalProgressContext) - getGoalPct(a, goalProgressContext))
          .map((goal) => (
            <GlanceItem
              key={goal.id}
              goal={goal}
              goalProgressContext={goalProgressContext}
              currentYear={currentYear}
            />
          ))}
      </div>
    </Card>
  );
}
