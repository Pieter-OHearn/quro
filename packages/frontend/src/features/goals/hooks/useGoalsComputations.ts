import { useEffect, useMemo } from 'react';
import type { DashboardAllocationsSummary, Goal, HoldingTransaction } from '@quro/shared';
import type {
  FilterKey,
  GoalProgressContext,
  GoalProgressSavingsAccount,
  GoalsComputations,
} from '../types';
import { GOAL_TYPE_META } from '../utils/goals-constants';
import { computeGoalStats, computeGoalYears } from '../utils/goals-data';
import { normalizeGoalType, parseGoalYear } from '../utils/goal-utils';

type SalaryPoint = {
  gross: number;
  bonus: number | null;
  date: string;
  currency: string;
};

const MONTH_PAD_LENGTH = 2;

function computeInvestHabitBuyMonths(
  holdingTxns: readonly HoldingTransaction[],
): ReadonlyMap<number, ReadonlySet<string>> {
  const yearMap = new Map<number, Set<string>>();
  for (const txn of holdingTxns) {
    if (txn.type !== 'buy' || !txn.date) continue;
    const date = new Date(txn.date + 'T00:00:00Z');
    const year = date.getUTCFullYear();
    const monthKey = `${year}-${String(date.getUTCMonth() + 1).padStart(MONTH_PAD_LENGTH, '0')}`;
    let months = yearMap.get(year);
    if (!months) {
      months = new Set();
      yearMap.set(year, months);
    }
    months.add(monthKey);
  }
  return yearMap;
}

function computeAllocationsContext(
  allocations: DashboardAllocationsSummary | null,
  convertToBase: (amount: number, fromCurrency: string) => number,
): { portfolioTotal: number; netWorth: number } {
  if (!allocations) return { portfolioTotal: 0, netWorth: 0 };
  const currency = allocations.allocations[0]?.currency ?? 'EUR';
  const totalAssets = allocations.allocations.reduce(
    (sum, a) => sum + convertToBase(a.value, a.currency),
    0,
  );
  const brokerage = allocations.allocations.find((a) => a.name === 'Brokerage');
  const portfolioTotal = brokerage ? convertToBase(brokerage.value, brokerage.currency) : 0;
  const netWorth = totalAssets - convertToBase(allocations.liabilitiesTotal, currency);
  return { portfolioTotal, netWorth };
}

export function useGoalsComputations(
  goals: Goal[],
  payslips: SalaryPoint[],
  savingsAccounts: GoalProgressSavingsAccount[],
  allocations: DashboardAllocationsSummary | null,
  holdingTxns: readonly HoldingTransaction[],
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
    () => computeAllocationsContext(allocations, convertToBase),
    [allocations, convertToBase],
  );

  const investHabitBuyMonths = useMemo(
    () => computeInvestHabitBuyMonths(holdingTxns),
    [holdingTxns],
  );

  const goalProgressContext = useMemo<GoalProgressContext>(
    () => ({
      annualGross,
      savingsAccounts,
      portfolioTotal,
      netWorth,
      investHabitBuyMonths,
      convertToBase,
    }),
    [annualGross, convertToBase, savingsAccounts, portfolioTotal, netWorth, investHabitBuyMonths],
  );

  const years = useMemo(() => computeGoalYears(goals, currentYear), [goals, currentYear]);

  useEffect(() => {
    if (!years.includes(activeYear)) {
      setActiveYear(years[years.length - 1] ?? currentYear);
    }
  }, [activeYear, years, currentYear, setActiveYear]);

  const yearGoals = useMemo(
    () => goals.filter((goal) => parseGoalYear(goal, currentYear) === activeYear),
    [goals, activeYear, currentYear],
  );

  const filteredGoals = useMemo(
    () =>
      goals.filter((goal) => {
        if (parseGoalYear(goal, currentYear) !== activeYear) return false;
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
