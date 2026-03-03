import type { GoalStatCardColor, GoalStatsData } from '../types';
import { buildGoalStatCards } from '../utils/goals-data';

const STAT_ICON_COLORS: Record<GoalStatCardColor, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  sky: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
};

type GoalsStatsGridProps = {
  stats: GoalStatsData;
  activeYear: number;
  fmtBase: (n: number) => string;
};

export function GoalsStatsGrid({ stats, activeYear, fmtBase }: Readonly<GoalsStatsGridProps>) {
  const cards = buildGoalStatCards(stats, activeYear, fmtBase);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, sub, icon: Icon, color }) => (
        <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div
            className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${STAT_ICON_COLORS[color]}`}
          >
            <Icon size={18} />
          </div>
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <p className="font-bold text-slate-900">{value}</p>
          <p className="text-xs text-slate-400 mt-1">{sub}</p>
        </div>
      ))}
    </div>
  );
}
