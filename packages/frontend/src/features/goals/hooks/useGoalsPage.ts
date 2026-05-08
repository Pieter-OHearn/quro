import { useState } from 'react';
import type { Goal } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { useAssetAllocations } from '@/features/dashboard/hooks';
import { useHoldingTransactions } from '@/features/investments/hooks';
import { usePayslips } from '@/features/salary/hooks';
import { useSavingsAccounts } from '@/features/savings/hooks';
import type { FilterKey, GoalsPageState, UpdateGoalInput } from '../types';
import { useCreateGoal } from './useCreateGoal';
import { useDeleteGoal } from './useDeleteGoal';
import { useGoals } from './useGoals';
import { useGoalsComputations } from './useGoalsComputations';
import { useUpdateGoal } from './useUpdateGoal';

export function useGoalsPage(): GoalsPageState {
  const { fmtBase, convertToBase } = useCurrency();
  const { data: goals = [], isLoading: loadingGoals } = useGoals();
  const { data: payslips = [], isLoading: loadingPayslips } = usePayslips();
  const { data: savingsAccounts = [], isLoading: loadingSavingsAccounts } = useSavingsAccounts();
  const { data: allocations = null } = useAssetAllocations();
  const { data: holdingTxns = [] } = useHoldingTransactions();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState(currentYear);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const { annualGross, goalProgressContext, years, yearGoals, filteredGoals, stats } =
    useGoalsComputations(
      goals,
      payslips,
      savingsAccounts,
      allocations,
      holdingTxns,
      convertToBase,
      currentYear,
      activeYear,
      activeFilter,
      setActiveYear,
    );

  const handleDelete = (id: number) => deleteGoal.mutate(id);
  const handleAddGoal = (goal: Omit<Goal, 'id'>) => createGoal.mutate(goal);
  const handleUpdateGoal = (input: UpdateGoalInput) => updateGoal.mutate(input);

  const handleUpdateMonths = (id: number, delta: number) => {
    const goal = goals.find((item) => item.id === id);
    if (!goal) return;

    updateGoal.mutate({
      id,
      monthsCompleted: Math.max(
        0,
        Math.min((goal.monthsCompleted ?? 0) + delta, goal.totalMonths ?? 12),
      ),
    });
  };

  const handleToggleMissedMonth = (goalId: number, monthKey: string) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const current = goal.missedMonths ?? [];
    const updated = current.includes(monthKey)
      ? current.filter((m) => m !== monthKey)
      : [...current, monthKey];
    updateGoal.mutate({ id: goalId, missedMonths: updated });
  };

  return {
    fmtBase,
    goals,
    loadingGoals,
    loadingPayslips,
    loadingSavingsAccounts,
    currentYear,
    activeYear,
    setActiveYear,
    activeFilter,
    setActiveFilter,
    showAdd,
    setShowAdd,
    editingGoal,
    setEditingGoal,
    annualGross,
    goalProgressContext,
    years,
    yearGoals,
    filteredGoals,
    stats,
    handleDelete,
    handleUpdateMonths,
    handleAddGoal,
    handleUpdateGoal,
    handleToggleMissedMonth,
  };
}
