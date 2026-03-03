import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import type { CompactFormatFn, GoalDisplay } from '../types';

function GoalProgressItem({
  goal,
  fmtBase,
}: Readonly<{
  goal: GoalDisplay;
  fmtBase: CompactFormatFn;
}>) {
  const pct = goal.target > 0 ? Math.min((goal.current / goal.target) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-base">{goal.icon}</span>
          <span className="text-sm font-medium text-slate-700">{goal.name}</span>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold text-slate-800">{fmtBase(goal.current)}</span>
          <span className="text-xs text-slate-400"> / {fmtBase(goal.target)}</span>
        </div>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: goal.color }}
        />
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5 text-right">{pct.toFixed(0)}% complete</p>
    </div>
  );
}

export function GoalsOverviewCard({
  goals,
  fmtBase,
}: Readonly<{
  goals: readonly GoalDisplay[];
  fmtBase: CompactFormatFn;
}>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-slate-900">Financial Goals</h3>
          <p className="text-xs text-slate-400 mt-0.5">Progress update</p>
        </div>
        <Link
          to="/goals"
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>
      {goals.length > 0 ? (
        <div className="space-y-5">
          {goals.map((goal) => (
            <GoalProgressItem key={goal.name} goal={goal} fmtBase={fmtBase} />
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
