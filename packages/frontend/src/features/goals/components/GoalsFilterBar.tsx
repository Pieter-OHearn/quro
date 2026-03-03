import { Plus } from 'lucide-react';
import type { Goal } from '@quro/shared';
import type { FilterKey } from '../types';
import { FILTERS, GOAL_TYPE_META } from '../utils/goals-constants';
import { normalizeGoalType, parseGoalYear } from '../utils/goal-utils';

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
  onAdd: () => void;
};

export function GoalsFilterBar({
  activeFilter,
  activeYear,
  currentYear,
  goals,
  onFilterChange,
  onAdd,
}: Readonly<GoalsFilterBarProps>) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 flex-wrap">
        {FILTERS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeFilter === key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Icon size={13} /> {label}
            {key !== 'all' && (
              <FilterCountBadge
                filterKey={key}
                activeFilter={activeFilter}
                goals={goals}
                activeYear={activeYear}
                currentYear={currentYear}
              />
            )}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <button
        onClick={onAdd}
        className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl transition-colors"
      >
        <Plus size={15} /> Add Goal
      </button>
    </div>
  );
}
