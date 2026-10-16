import type { Goal } from '@quro/shared';
import type { GoalProgressContext, GoalStatCard, GoalStatsData } from '../types';
import { getGoalStatus, parseGoalYear } from './goal-utils';

export const computeGoalStats = (
  yearGoals: readonly Goal[],
  context: GoalProgressContext,
  currentYear: number,
): GoalStatsData => {
  const count = (status: string) =>
    yearGoals.filter((goal) => getGoalStatus(goal, context, currentYear) === status).length;
  const monthly = yearGoals.reduce(
    (sum, goal) =>
      sum +
      context.convertToBase(goal.monthlyContribution || goal.monthlyTarget || 0, goal.currency),
    0,
  );

  return {
    total: yearGoals.length,
    completed: count('complete'),
    onTrack: count('on_track'),
    atRisk: count('at_risk'),
    monthly,
  };
};

export const computeGoalYears = (goals: readonly Goal[], currentYear: number): number[] => {
  const uniqueYears = new Set<number>();
  for (const goal of goals) {
    uniqueYears.add(parseGoalYear(goal, currentYear));
  }
  uniqueYears.add(currentYear);
  return [...uniqueYears].sort((a, b) => a - b);
};

export const buildGoalStatCards = (
  stats: GoalStatsData,
  activeYear: number,
  fmtBase: (n: number) => string,
): readonly GoalStatCard[] => [
  {
    label: 'Total goals',
    value: stats.total.toString(),
    sub: `${activeYear} plan`,
  },
  {
    label: 'On track',
    value: stats.onTrack.toString(),
    sub: `${stats.atRisk} need attention`,
  },
  {
    label: 'Monthly commitment',
    value: fmtBase(stats.monthly),
    sub: 'Savings + invest habits',
  },
  {
    label: 'Completed',
    value: stats.completed.toString(),
    sub: stats.completed > 0 ? 'Great work!' : '-',
  },
];
