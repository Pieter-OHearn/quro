import { allocationTotals } from '@/lib/allocationTotals';
import { useEffect, useMemo } from 'react';
import {
  monthKeyOfDate,
  todayIsoDate,
  type DashboardAllocationsSummary,
  type Goal,
  type InvestHabitBuyTotal,
} from '@quro/shared';
import type {
  FilterKey,
  GoalProgressContext,
  GoalProgressSavingsAccount,
  GoalsComputations,
} from '../types';
import { GOAL_TYPE_META } from '../utils/goals-constants';
import { computeGoalStats, computeGoalYears } from '../utils/goals-data';
import { goalCoversYear, normalizeGoalType } from '../utils/goal-utils';
import { buildInvestHabitBuys } from '../utils/invest-habit';

type SalaryPoint = {
  gross: number;
  bonus: number | null;
  date: string;
  currency: string;
};

export function useGoalsComputations(
  goals: Goal[],
  payslips: SalaryPoint[],
  savingsAccounts: GoalProgressSavingsAccount[],
  allocations: DashboardAllocationsSummary | null,
  investHabitBuyTotals: readonly InvestHabitBuyTotal[],
  convertToBase: (amount: number, fromCurrency: string) => number,
  currentYear: number,
  activeYear: number,
  activeFilter: FilterKey,
  setActiveYear: (year: number) => void,
): GoalsComputations {
  const annualGross = useMemo(() => {
    const yearPayslips = payslips.filter(
      (p) => new Date(p.date + 'T00:00:00Z').getUTCFullYear() === currentYear,
    );
    return yearPayslips.reduce(
      (sum, p) => sum + convertToBase(p.gross + (p.bonus ?? 0), p.currency),
      0,
    );
  }, [convertToBase, payslips, currentYear]);

  const { portfolioTotal, netWorth } = useMemo(
    () => allocationTotals(allocations, convertToBase),
    [allocations, convertToBase],
  );

  const investHabitBuys = useMemo(
    () => buildInvestHabitBuys(investHabitBuyTotals, convertToBase),
    [investHabitBuyTotals, convertToBase],
  );
  const currentMonth = monthKeyOfDate(todayIsoDate());

  const goalProgressContext = useMemo<GoalProgressContext>(
    () => ({
      annualGross,
      savingsAccounts,
      portfolioTotal,
      netWorth,
      investHabitBuys,
      currentMonth,
      convertToBase,
    }),
    [
      annualGross,
      convertToBase,
      savingsAccounts,
      portfolioTotal,
      netWorth,
      investHabitBuys,
      currentMonth,
    ],
  );

  const years = useMemo(() => computeGoalYears(goals, currentYear), [goals, currentYear]);

  useEffect(() => {
    if (!years.includes(activeYear)) {
      setActiveYear(years[years.length - 1] ?? currentYear);
    }
  }, [activeYear, years, currentYear, setActiveYear]);

  const yearGoals = useMemo(
    () => goals.filter((goal) => goalCoversYear(goal, activeYear, currentYear)),
    [goals, activeYear, currentYear],
  );

  const filteredGoals = useMemo(
    () =>
      goals.filter((goal) => {
        if (!goalCoversYear(goal, activeYear, currentYear)) return false;
        return (
          activeFilter === 'all' ||
          GOAL_TYPE_META[normalizeGoalType(goal)].filterKey === activeFilter
        );
      }),
    [goals, activeYear, activeFilter, currentYear],
  );

  const stats = useMemo(
    () => computeGoalStats(yearGoals, goalProgressContext, currentYear),
    [yearGoals, goalProgressContext, currentYear],
  );

  return { annualGross, goalProgressContext, years, yearGoals, filteredGoals, stats };
}
