import type { ElementType } from 'react';
import type { Goal, SavingsAccount } from '@quro/shared';
import type { LucideIcon } from 'lucide-react';

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
  sourceId: string;
  startMonth: string;
  currency: string;
};

export type GoalFormField = keyof GoalFormState;

export type AddGoalModalProps = {
  onClose: () => void;
  onSave: (goal: CreateGoalInput) => void;
  initialFilter?: FilterKey;
};

export type CreateGoalInput = Omit<Goal, 'id'>;
export type UpdateGoalInput = { id: number } & Partial<Omit<Goal, 'id'>>;

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
  icon: LucideIcon;
  color: GoalStatCardColor;
};

export type GoalsComputations = {
  annualGross: number;
  goalProgressContext: GoalProgressContext;
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
  loadingSavingsAccounts: boolean;
  currentYear: number;
  activeYear: number;
  setActiveYear: (year: number) => void;
  activeFilter: FilterKey;
  setActiveFilter: (filter: FilterKey) => void;
  showAdd: boolean;
  setShowAdd: (show: boolean) => void;
  editingGoal: Goal | null;
  setEditingGoal: (goal: Goal | null) => void;
  annualGross: number;
  goalProgressContext: GoalProgressContext;
  years: number[];
  yearGoals: Goal[];
  filteredGoals: Goal[];
  stats: GoalStatsData;
  handleDelete: (id: number) => void;
  handleUpdateMonths: (id: number, delta: number) => void;
  handleAddGoal: (goal: CreateGoalInput) => void;
  handleUpdateGoal: (input: UpdateGoalInput) => void;
  handleToggleMissedMonth: (goalId: number, monthKey: string) => void;
};

export type GoalProgressSavingsAccount = Pick<
  SavingsAccount,
  'id' | 'name' | 'balance' | 'currency' | 'archivedAt'
>;

export type GoalProgressContext = {
  annualGross: number;
  savingsAccounts: readonly GoalProgressSavingsAccount[];
  portfolioTotal: number;
  netWorth: number;
  investHabitBuyMonths: ReadonlyMap<number, ReadonlySet<string>>;
  convertToBase: (amount: number, fromCurrency: string) => number;
};
