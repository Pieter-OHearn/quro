import type { LucideIcon } from 'lucide-react';

export type DashboardFormatFn = (n: number, u?: undefined, c?: boolean) => string;
export type CompactFormatFn = (n: number) => string;

export type DashboardTransaction = {
  id: string | number;
  name: string;
  category: string;
  date: string;
  type: string;
  amount: number;
};

export type AllocationItem = {
  name: string;
  value: number;
  color: string;
};

export type GoalDisplay = {
  name: string;
  current: number;
  target: number;
  color: string;
  icon: string;
};

export type MonthlySummaryItem = {
  label: string;
  value: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
};

export type GoalSummaryItem = {
  type?: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  monthlyTarget?: number;
  monthsCompleted?: number;
  totalMonths?: number;
  color: string;
  emoji: string;
};

export type DashboardCard = {
  label: string;
  value: number;
  monthlyChange: number;
  icon: LucideIcon;
  path: string;
  color: 'indigo' | 'sky' | 'amber' | 'emerald';
};

export type DashboardTxnStats = {
  monthlyCategoryChange: (category: string) => number;
  monthlySalaryValue: number;
  monthlySalaryChange: number;
  totalIncome: number;
  totalExpenses: number;
};

export type NetWorthMetricData = { month: string; year: number; value: number };
