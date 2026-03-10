import { Sparkles } from 'lucide-react';
import { SegmentedControl } from '@/components/ui';
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
      <SegmentedControl
        options={years.map((year) => ({
          value: year,
          label: year,
          badge:
            year === currentYear ? (
              <span className="text-[10px] opacity-70">current</span>
            ) : undefined,
        }))}
        value={activeYear}
        onChange={onYearChange}
        variant="pill"
        tone="dark"
        buttonClassName="px-5 font-semibold"
      />
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-white border border-slate-200 rounded-xl px-3 py-2">
        <Sparkles size={12} className="text-indigo-400" />
        {stats.total} goals - {stats.completed} completed - {stats.onTrack} on track
      </div>
    </div>
  );
}
