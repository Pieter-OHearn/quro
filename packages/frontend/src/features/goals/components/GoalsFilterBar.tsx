import { Plus } from 'lucide-react';
import type { Goal } from '@quro/shared';
import { SegmentedControl } from '@/components/ui';
import type { FilterKey } from '../types';
import { FILTERS, GOAL_TYPE_META } from '../utils/goals-constants';
import { normalizeGoalType, parseGoalYear } from '../utils/goal-utils';

const FILTER_HAS_SINGLE_TYPE = new Set<FilterKey>(['savings', 'career']);

type FilterCountBadgeProps = {
  filterKey: FilterKey;
  activeFilter: FilterKey;
  goals: readonly Goal[];
  activeYear: number;
  currentYear: number;
};

function FilterCountBadge({
  filterKey,
  activeFilter,
  goals,
  activeYear,
  currentYear,
}: Readonly<FilterCountBadgeProps>) {
  const count = goals.filter(
    (goal) =>
      parseGoalYear(goal, currentYear) === activeYear &&
      GOAL_TYPE_META[normalizeGoalType(goal)].filterKey === filterKey,
  ).length;

  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeFilter === filterKey ? 'bg-white/20' : 'bg-slate-100'}`}
    >
      {count}
    </span>
  );
}

type GoalsFilterBarProps = {
  activeFilter: FilterKey;
  activeYear: number;
  currentYear: number;
  goals: readonly Goal[];
  onFilterChange: (key: FilterKey) => void;
  onAdd: (filter?: FilterKey) => void;
};

export function GoalsFilterBar({
  activeFilter,
  activeYear,
  currentYear,
  goals,
  onFilterChange,
  onAdd,
}: Readonly<GoalsFilterBarProps>) {
  const handleAdd = () => {
    onAdd(activeFilter !== 'all' ? activeFilter : undefined);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SegmentedControl
        options={FILTERS.map(({ key, label, Icon }) => ({
          value: key,
          label,
          icon: <Icon size={13} />,
          badge:
            key !== 'all' ? (
              <FilterCountBadge
                filterKey={key}
                activeFilter={activeFilter}
                goals={goals}
                activeYear={activeYear}
                currentYear={currentYear}
              />
            ) : undefined,
        }))}
        value={activeFilter}
        onChange={onFilterChange}
        variant="contained"
      />
      <div className="flex-1" />
      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl transition-colors"
      >
        <Plus size={15} />
        {FILTER_HAS_SINGLE_TYPE.has(activeFilter)
          ? `Add ${FILTERS.find((f) => f.key === activeFilter)?.label ?? ''} Goal`
          : 'Add Goal'}
      </button>
    </div>
  );
}
