import { useState } from 'react';
import type { Goal } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { usePayslips } from '@/features/salary/hooks';
import type { FilterKey, GoalsPageState } from '../types';
import { useCreateGoal } from './useCreateGoal';
import { useDeleteGoal } from './useDeleteGoal';
import { useGoals } from './useGoals';
import { useGoalsComputations } from './useGoalsComputations';
import { useUpdateGoal } from './useUpdateGoal';

export function useGoalsPage(): GoalsPageState {
  const { fmtBase } = useCurrency();
  const { data: goals = [], isLoading: loadingGoals } = useGoals();
  const { data: payslips = [], isLoading: loadingPayslips } = usePayslips();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState(currentYear);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [showAdd, setShowAdd] = useState(false);

  const { annualGross, years, yearGoals, filteredGoals, stats } = useGoalsComputations(
    goals,
    payslips,
    currentYear,
    activeYear,
    activeFilter,
    setActiveYear,
  );

  const handleDelete = (id: number) => {
    deleteGoal.mutate(id);
  };

  const handleAddGoal = (goal: Omit<Goal, 'id'>) => {
    createGoal.mutate(goal);
  };

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

  return {
    fmtBase,
    goals,
    loadingGoals,
    loadingPayslips,
    currentYear,
    activeYear,
    setActiveYear,
    activeFilter,
    setActiveFilter,
    showAdd,
    setShowAdd,
    annualGross,
    years,
    yearGoals,
    filteredGoals,
    stats,
    handleDelete,
    handleUpdateMonths,
    handleAddGoal,
  };
}
