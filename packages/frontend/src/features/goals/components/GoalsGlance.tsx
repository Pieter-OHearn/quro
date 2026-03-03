import type { Goal } from '@quro/shared';
import { STATUS_META } from '../utils/goals-constants';
import { getGoalPct, getGoalStatus, normalizeGoalType } from '../utils/goal-utils';

type GlanceItemProps = {
  goal: Goal;
  annualGross: number;
  currentYear: number;
};

function GlanceItem({ goal, annualGross, currentYear }: Readonly<GlanceItemProps>) {
  const pct = getGoalPct(goal, annualGross);
  const status = getGoalStatus(goal, annualGross, currentYear);
  const type = normalizeGoalType(goal);

  return (
    <div className="group flex items-center gap-3">
      <span className="text-base w-7 text-center flex-shrink-0">{goal.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-700 truncate">{goal.name}</span>
          <span className="text-xs font-semibold text-slate-500 flex-shrink-0 ml-2">
            {type === 'invest_habit'
              ? `${goal.monthsCompleted ?? 0}/${goal.totalMonths ?? 12}mo`
              : `${pct.toFixed(0)}%`}
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.max(0, Math.min(pct, 100))}%`,
              backgroundColor: goal.color || '#6366f1',
            }}
          />
        </div>
      </div>
      <span
        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_META[status].color}`}
      >
        {STATUS_META[status].label}
      </span>
    </div>
  );
}

type GoalsGlanceProps = {
  yearGoals: readonly Goal[];
  annualGross: number;
  currentYear: number;
  activeYear: number;
};

export function GoalsGlance({
  yearGoals,
  annualGross,
  currentYear,
  activeYear,
}: Readonly<GoalsGlanceProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">{activeYear} Goals at a Glance</h3>
      <p className="text-xs text-slate-400 mb-5">All goals sorted by progress</p>
      <div className="space-y-3">
        {[...yearGoals]
          .sort((a, b) => getGoalPct(b, annualGross) - getGoalPct(a, annualGross))
          .map((goal) => (
            <GlanceItem
              key={goal.id}
              goal={goal}
              annualGross={annualGross}
              currentYear={currentYear}
            />
          ))}
      </div>
    </div>
  );
}
