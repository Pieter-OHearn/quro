import type { GoalsPageState } from '../types';
import { AddGoalModal } from './AddGoalModal';
import { EditGoalModal } from './EditGoalModal';
import { GoalsCardGrid } from './GoalsCardGrid';
import { GoalsFilterBar } from './GoalsFilterBar';
import { GoalsHeader } from './GoalsHeader';
import { GoalsStatsGrid } from './GoalsStatsGrid';

type GoalsMainContentProps = {
  state: GoalsPageState;
};

export function GoalsMainContent({ state }: Readonly<GoalsMainContentProps>) {
  const initialFilter = state.activeFilter !== 'all' ? state.activeFilter : undefined;

  return (
    <div className="p-6 space-y-6">
      {state.showAdd && (
        <AddGoalModal
          onClose={() => state.setShowAdd(false)}
          onSave={state.handleAddGoal}
          initialFilter={initialFilter}
        />
      )}
      {state.editingGoal && (
        <EditGoalModal
          goal={state.editingGoal}
          onClose={() => state.setEditingGoal(null)}
          onSave={state.handleUpdateGoal}
        />
      )}
      <GoalsHeader
        years={state.years}
        activeYear={state.activeYear}
        currentYear={state.currentYear}
        stats={state.stats}
        onYearChange={state.setActiveYear}
      />
      <GoalsStatsGrid stats={state.stats} activeYear={state.activeYear} fmtBase={state.fmtBase} />
      <GoalsFilterBar
        activeFilter={state.activeFilter}
        activeYear={state.activeYear}
        currentYear={state.currentYear}
        goals={state.goals}
        onFilterChange={state.setActiveFilter}
        onAdd={() => state.setShowAdd(true)}
      />
      <GoalsCardGrid
        filteredGoals={state.filteredGoals}
        goalProgressContext={state.goalProgressContext}
        currentYear={state.currentYear}
        activeFilter={state.activeFilter}
        activeYear={state.activeYear}
        yearGoals={state.yearGoals}
        onDelete={state.handleDelete}
        onEdit={(id) => state.setEditingGoal(state.goals.find((g) => g.id === id) ?? null)}
        onUpdateMonths={state.handleUpdateMonths}
        onToggleMissedMonth={state.handleToggleMissedMonth}
        onAdd={() => state.setShowAdd(true)}
      />
    </div>
  );
}
