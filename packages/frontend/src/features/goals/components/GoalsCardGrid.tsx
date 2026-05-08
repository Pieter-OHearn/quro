import type { Goal } from '@quro/shared';
import type { FilterKey, GoalProgressContext } from '../types';
import { GoalCard } from './GoalCard';
import { GoalsEmptyState } from './GoalsEmptyState';
import { GoalsGlance } from './GoalsGlance';

type GoalsCardGridProps = {
  filteredGoals: Goal[];
  goalProgressContext: GoalProgressContext;
  currentYear: number;
  activeFilter: FilterKey;
  activeYear: number;
  yearGoals: Goal[];
  onDelete: (id: number) => void;
  onEdit: (id: number) => void;
  onUpdateMonths: (id: number, delta: number) => void;
  onToggleMissedMonth: (id: number, monthKey: string) => void;
  onAdd: () => void;
};

export function GoalsCardGrid({
  filteredGoals,
  goalProgressContext,
  currentYear,
  activeFilter,
  activeYear,
  yearGoals,
  onDelete,
  onEdit,
  onUpdateMonths,
  onToggleMissedMonth,
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
            goalProgressContext={goalProgressContext}
            currentYear={currentYear}
            onDelete={onDelete}
            onEdit={onEdit}
            onUpdateMonths={onUpdateMonths}
            onToggleMissedMonth={onToggleMissedMonth}
          />
        ))}
      </div>
      <GoalsGlance
        yearGoals={yearGoals}
        goalProgressContext={goalProgressContext}
        currentYear={currentYear}
        activeYear={activeYear}
      />
    </>
  );
}
