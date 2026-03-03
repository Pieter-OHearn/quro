import type { Goal } from '@quro/shared';
import type { FilterKey } from '../types';
import { GoalCard } from './GoalCard';
import { GoalsEmptyState } from './GoalsEmptyState';
import { GoalsGlance } from './GoalsGlance';

type GoalsCardGridProps = {
  filteredGoals: Goal[];
  annualGross: number;
  currentYear: number;
  activeFilter: FilterKey;
  activeYear: number;
  yearGoals: Goal[];
  onDelete: (id: number) => void;
  onUpdateMonths: (id: number, delta: number) => void;
  onAdd: () => void;
};

export function GoalsCardGrid({
  filteredGoals,
  annualGross,
  currentYear,
  activeFilter,
  activeYear,
  yearGoals,
  onDelete,
  onUpdateMonths,
  onAdd,
}: Readonly<GoalsCardGridProps>) {
  if (filteredGoals.length === 0) {
    return <GoalsEmptyState activeFilter={activeFilter} activeYear={activeYear} onAdd={onAdd} />;
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filteredGoals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            annualGross={annualGross}
            currentYear={currentYear}
            onDelete={onDelete}
            onUpdateMonths={onUpdateMonths}
          />
        ))}
      </div>
      <GoalsGlance
        yearGoals={yearGoals}
        annualGross={annualGross}
        currentYear={currentYear}
        activeYear={activeYear}
      />
    </>
  );
}
