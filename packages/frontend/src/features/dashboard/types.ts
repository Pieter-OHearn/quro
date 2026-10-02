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
  isJoint: boolean;
};

export type AllocationItem = {
  key: import('@quro/shared').AllocationKey;
  name: string;
  value: number;
  color: string;
};

export type AllocationSummary = {
  allocationData: AllocationItem[];
  totalAssets: number;
  liabilitiesTotal: number;
  debtCount: number;
  netWorth: number;
  portfolioTotal: number;
};

export type MonthlySummaryItem = {
  label: string;
  value: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
};

export type DashboardCard = {
  label: string;
  value: number;
  change: {
    amount: number;
    label: string;
  };
  icon: LucideIcon;
  path: string;
  color: 'indigo' | 'sky' | 'amber' | 'emerald';
};

export type DashboardTxnStats = {
  monthlyCategoryChange: (category: string) => number;
  monthlySalaryValue: number;
  salaryTrendChange: number;
  totalIncome: number;
  totalExpenses: number;
  totalSavingsDeposited: number;
};

export type NetWorthMetricData = {
  month: string;
  year: number;
  value: number;
  isEstimated: boolean;
};
