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
    <div className="flex flex-wrap items-center justify-between gap-2">
      <SegmentedControl
        aria-label="Goal year"
        options={years.map((year) => ({
          value: year,
          label: year,
          badge:
            year === currentYear ? (
              <span className="font-normal text-fg-muted">current</span>
            ) : undefined,
        }))}
        value={activeYear}
        onChange={onYearChange}
        buttonClassName="font-numeric"
      />
      <p className="text-caption text-fg-subtle font-numeric">
        {stats.total} goals - {stats.completed} completed - {stats.onTrack} on track
      </p>
    </div>
  );
}
