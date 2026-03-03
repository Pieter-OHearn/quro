import { Calendar, CheckCircle2, Target, Trophy } from 'lucide-react';
import type { Goal } from '@quro/shared';
import type { GoalStatCard, GoalStatsData } from '../types';
import { getGoalStatus, parseGoalYear } from './goal-utils';

export const computeGoalStats = (
  yearGoals: readonly Goal[],
  annualGross: number,
  currentYear: number,
): GoalStatsData => {
  const count = (status: string) =>
    yearGoals.filter((goal) => getGoalStatus(goal, annualGross, currentYear) === status).length;
  const monthly = yearGoals.reduce(
    (sum, goal) => sum + (goal.monthlyContribution || goal.monthlyTarget || 0),
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
    label: 'Total Goals',
    value: stats.total.toString(),
    sub: `${activeYear} plan`,
    icon: Target,
    color: 'indigo',
  },
  {
    label: 'On Track',
    value: stats.onTrack.toString(),
    sub: `${stats.atRisk} need attention`,
    icon: CheckCircle2,
    color: 'emerald',
  },
  {
    label: 'Monthly Commitment',
    value: fmtBase(stats.monthly),
    sub: 'Savings + invest habits',
    icon: Calendar,
    color: 'sky',
  },
  {
    label: 'Completed',
    value: stats.completed.toString(),
    sub: stats.completed > 0 ? 'Great work!' : '-',
    icon: Trophy,
    color: 'amber',
  },
];
