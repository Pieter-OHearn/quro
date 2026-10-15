import { Plus } from 'lucide-react';
import type { Goal } from '@quro/shared';
import { Button, SegmentedControl } from '@/components/ui';
import type { FilterKey } from '../types';
import { FILTERS, GOAL_TYPE_META } from '../utils/goals-constants';
import { normalizeGoalType, parseGoalYear } from '../utils/goal-utils';

const FILTER_HAS_SINGLE_TYPE = new Set<FilterKey>(['savings', 'career']);

type FilterCountBadgeProps = {
  filterKey: FilterKey;
  goals: readonly Goal[];
  activeYear: number;
  currentYear: number;
};

function FilterCountBadge({
  filterKey,
  goals,
  activeYear,
  currentYear,
}: Readonly<FilterCountBadgeProps>) {
  const count = goals.filter(
    (goal) =>
      parseGoalYear(goal, currentYear) === activeYear &&
      GOAL_TYPE_META[normalizeGoalType(goal)].filterKey === filterKey,
  ).length;

  return <span className="font-normal font-numeric text-fg-subtle">{count}</span>;
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
    <div className="flex flex-wrap items-center justify-between gap-2">
      <SegmentedControl
        aria-label="Filter goals"
        options={FILTERS.map(({ key, label, Icon }) => ({
          value: key,
          label,
          icon: <Icon size={12} aria-hidden />,
          badge:
            key !== 'all' ? (
              <FilterCountBadge
                filterKey={key}
                goals={goals}
                activeYear={activeYear}
                currentYear={currentYear}
              />
            ) : undefined,
        }))}
        value={activeFilter}
        onChange={onFilterChange}
        className="max-sm:w-full"
      />
      <Button
        onClick={handleAdd}
        leadingIcon={<Plus size={14} aria-hidden />}
        className="max-sm:w-full"
      >
        {FILTER_HAS_SINGLE_TYPE.has(activeFilter)
          ? `Add ${FILTERS.find((f) => f.key === activeFilter)?.label ?? ''} Goal`
          : 'Add Goal'}
      </Button>
    </div>
  );
}
