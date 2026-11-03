import { useState } from 'react';
import type { Goal, InvestHabitBuyTotal } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import { useAssetAllocations, useDashboardInsights } from '@/features/dashboard/hooks';
import { usePayslips } from '@/features/salary/hooks';
import { useSavingsAccounts } from '@/features/savings/hooks';
import type { FilterKey, GoalsPageState, UpdateGoalInput } from '../types';
import { useCreateGoal, useDeleteGoal, useUpdateGoal } from './mutations';
import { useGoals } from './useGoals';
import { useGoalsComputations } from './useGoalsComputations';

const NO_INVEST_HABIT_BUYS: InvestHabitBuyTotal[] = [];

function useGoalsQueries(currentYear: number) {
  const goalsQuery = useGoals();
  const payslipsQuery = usePayslips();
  const savingsAccountsQuery = useSavingsAccounts();
  // The compact insights carry the buys an invest habit counts, per month and currency.
  const insightsQuery = useDashboardInsights(currentYear);

  return {
    goals: goalsQuery.data ?? [],
    payslips: payslipsQuery.data ?? [],
    savingsAccounts: savingsAccountsQuery.data ?? [],
    investHabitBuys: insightsQuery.data?.investHabitBuys ?? NO_INVEST_HABIT_BUYS,
    loadingGoals: goalsQuery.isLoading,
    loadingPayslips: payslipsQuery.isLoading,
    loadingSavingsAccounts: savingsAccountsQuery.isLoading,
    queryFailures: getFailedRouteQueries([
      { label: 'goals', ...goalsQuery },
      { label: 'payslips', ...payslipsQuery },
      { label: 'savings accounts', ...savingsAccountsQuery },
      { label: 'investment buys', ...insightsQuery },
    ]),
  };
}

export function useGoalsPage(): GoalsPageState {
  const { fmtBase, convertToBase } = useCurrency();
  const currentYear = new Date().getFullYear();
  const queries = useGoalsQueries(currentYear);
  const { goals, payslips, savingsAccounts, investHabitBuys } = queries;
  const { data: allocations = null } = useAssetAllocations();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

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
      investHabitBuys,
      convertToBase,
      currentYear,
      activeYear,
      activeFilter,
      setActiveYear,
    );

  const handleDelete = (id: number) => deleteGoal.mutate(id);
  const handleAddGoal = (goal: Omit<Goal, 'id'>) => createGoal.mutate(goal);
  const handleUpdateGoal = (input: UpdateGoalInput) => updateGoal.mutate(input);

  return {
    fmtBase,
    goals,
    loadingGoals: queries.loadingGoals,
    loadingPayslips: queries.loadingPayslips,
    loadingSavingsAccounts: queries.loadingSavingsAccounts,
    queryFailures: queries.queryFailures,
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
    handleAddGoal,
    handleUpdateGoal,
  };
}
