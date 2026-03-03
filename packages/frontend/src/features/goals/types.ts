import type { ElementType } from 'react';
import type { Goal, GoalType } from '@quro/shared';

export type GoalStatus = 'complete' | 'on_track' | 'at_risk' | 'pending';
export type FilterKey = 'all' | 'savings' | 'career' | 'investing' | 'annual';

export type GoalMeta = {
  label: string;
  Icon: ElementType;
  bg: string;
  text: string;
  filterKey: FilterKey;
  description: string;
};

export type GoalFormState = {
  name: string;
  emoji: string;
  color: string;
  notes: string;
  deadline: string;
  year: string;
  current: string;
  target: string;
  monthlyContrib: string;
  monthlyTarget: string;
  totalMonths: string;
  unit: string;
};

export type GoalFormField = keyof GoalFormState;

export type AddGoalModalProps = {
  onClose: () => void;
  onSave: (goal: CreateGoalInput) => void;
};

export type CreateGoalInput = Omit<Goal, 'id'>;
export type UpdateGoalInput = { id: number } & Partial<Omit<Goal, 'id'>>;

export type ApiGoal = Omit<
  Goal,
  | 'type'
  | 'currentAmount'
  | 'targetAmount'
  | 'year'
  | 'monthlyContribution'
  | 'monthlyTarget'
  | 'monthsCompleted'
  | 'totalMonths'
> & {
  type?: GoalType | string | null;
  currentAmount: number | string;
  targetAmount: number | string;
  year?: number | string | null;
  monthlyContribution: number | string;
  monthlyTarget?: number | string | null;
  monthsCompleted?: number | string | null;
  totalMonths?: number | string | null;
};

export type GoalStatsData = {
  total: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  monthly: number;
};

export type GoalStatCardColor = 'indigo' | 'emerald' | 'sky' | 'amber';

export type GoalStatCard = {
  label: string;
  value: string;
  sub: string;
  icon: ElementType;
  color: GoalStatCardColor;
};

export type GoalsComputations = {
  annualGross: number;
  years: number[];
  yearGoals: Goal[];
  filteredGoals: Goal[];
  stats: GoalStatsData;
};

export type GoalsPageState = {
  fmtBase: (n: number) => string;
  goals: Goal[];
  loadingGoals: boolean;
  loadingPayslips: boolean;
  currentYear: number;
  activeYear: number;
  setActiveYear: (year: number) => void;
  activeFilter: FilterKey;
  setActiveFilter: (filter: FilterKey) => void;
  showAdd: boolean;
  setShowAdd: (show: boolean) => void;
  annualGross: number;
  years: number[];
  yearGoals: Goal[];
  filteredGoals: Goal[];
  stats: GoalStatsData;
  handleDelete: (id: number) => void;
  handleUpdateMonths: (id: number, delta: number) => void;
  handleAddGoal: (goal: CreateGoalInput) => void;
};
