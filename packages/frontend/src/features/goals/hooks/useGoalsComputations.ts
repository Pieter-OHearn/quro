import { useEffect, useMemo } from 'react';
import type { Goal } from '@quro/shared';
import type { FilterKey, GoalsComputations } from '../types';
import { GOAL_TYPE_META } from '../utils/goals-constants';
import { computeGoalStats, computeGoalYears } from '../utils/goals-data';
import { normalizeGoalType, parseGoalYear } from '../utils/goal-utils';

type SalaryPoint = {
  gross: number;
  date: string;
};

export function useGoalsComputations(
  goals: Goal[],
  payslips: SalaryPoint[],
  currentYear: number,
  activeYear: number,
  activeFilter: FilterKey,
  setActiveYear: (year: number) => void,
): GoalsComputations {
  const annualGross = useMemo(() => {
    if (payslips.length === 0) return 0;
    const latest = [...payslips].sort((a, b) => b.date.localeCompare(a.date))[0];
    return (latest?.gross ?? 0) * 12;
  }, [payslips]);

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
    () => computeGoalStats(yearGoals, annualGross, currentYear),
    [yearGoals, annualGross, currentYear],
  );

  return { annualGross, years, yearGoals, filteredGoals, stats };
}
