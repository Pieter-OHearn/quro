import { Sparkles } from 'lucide-react';
import type { GoalStatsData } from '../types';

type GoalsHeaderProps = {
  years: readonly number[];
  activeYear: number;
  currentYear: number;
  stats: GoalStatsData;
  onYearChange: (year: number) => void;
};

export function GoalsHeader({
  years,
  activeYear,
  currentYear,
  stats,
  onYearChange,
}: Readonly<GoalsHeaderProps>) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {years.map((year) => (
        <button
          key={year}
          onClick={() => onYearChange(year)}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${year === activeYear ? 'bg-[#0a0f1e] text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          {year}
          {year === currentYear && <span className="ml-1.5 text-[10px] opacity-70">current</span>}
        </button>
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-white border border-slate-200 rounded-xl px-3 py-2">
        <Sparkles size={12} className="text-indigo-400" />
        {stats.total} goals - {stats.completed} completed - {stats.onTrack} on track
      </div>
    </div>
  );
}
