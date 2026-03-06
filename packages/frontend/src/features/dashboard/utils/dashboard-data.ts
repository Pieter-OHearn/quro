import { Briefcase, PiggyBank, ShieldCheck, TrendingUp } from 'lucide-react';
import type {
  DashboardCard,
  DashboardFormatFn,
  DashboardTransaction,
  DashboardTxnStats,
  GoalDisplay,
  GoalSummaryItem,
  MonthlySummaryItem,
  NetWorthMetricData,
} from '../types';

export const getGreeting = (hour: number): string => {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export const deriveGoalDisplay = (g: GoalSummaryItem, monthlySalaryValue: number): GoalDisplay => {
  const goalType = g.type ?? 'savings';

  if (goalType === 'invest_habit') {
    const monthlyTarget = g.monthlyTarget ?? 0;
    const monthsCompleted = g.monthsCompleted ?? 0;
    const totalMonths = g.totalMonths ?? 12;
    return {
      name: g.name,
      current: monthlyTarget * monthsCompleted,
      target: monthlyTarget * totalMonths,
      color: g.color,
      icon: g.emoji,
    };
  }

  if (goalType === 'salary') {
    return {
      name: g.name,
      current: monthlySalaryValue * 12,
      target: g.targetAmount,
      color: g.color,
      icon: g.emoji,
    };
  }

  return {
    name: g.name,
    current: g.currentAmount,
    target: g.targetAmount,
    color: g.color,
    icon: g.emoji,
  };
};

export const buildDashboardCards = (
  allocationByName: Record<string, number>,
  monthlySalaryValue: number,
  monthlySalaryChange: number,
  monthlyCategoryChange: (category: string) => number,
): DashboardCard[] => [
  {
    label: 'Total Savings',
    value: allocationByName.Savings ?? 0,
    monthlyChange: monthlyCategoryChange('Savings'),
    icon: PiggyBank,
    path: '/savings',
    color: 'indigo',
  },
  {
    label: 'Investments',
    value: allocationByName.Brokerage ?? 0,
    monthlyChange: monthlyCategoryChange('Investment'),
    icon: TrendingUp,
    path: '/investments',
    color: 'sky',
  },
  {
    label: 'Pension',
    value: allocationByName.Pension ?? 0,
    monthlyChange: monthlyCategoryChange('Pension'),
    icon: ShieldCheck,
    path: '/pension',
    color: 'amber',
  },
  {
    label: 'Monthly Salary',
    value: monthlySalaryValue,
    monthlyChange: monthlySalaryChange,
    icon: Briefcase,
    path: '/salary',
    color: 'emerald',
  },
];

const getMonthKeys = (d: Date) => {
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return { currentKey: fmt(d), prevKey: fmt(new Date(d.getFullYear(), d.getMonth() - 1, 1)) };
};

const computeSalary = (
  txns: readonly DashboardTransaction[],
  monthKey: string,
  prevKey: string,
) => {
  const monthlySalary = txns.filter((t) => t.category === 'Salary' && t.date.startsWith(monthKey));
  const thisMonth = monthlySalary.reduce((s, t) => s + Math.abs(t.amount), 0);
  const lastMonth = txns
    .filter((t) => t.category === 'Salary' && t.date.startsWith(prevKey))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const latest = txns.find((t) => t.category === 'Salary');
  const value = thisMonth > 0 ? thisMonth : latest ? Math.abs(latest.amount) : 0;
  return { monthlySalaryValue: value, monthlySalaryChange: lastMonth > 0 ? value - lastMonth : 0 };
};

export const computeNWMetrics = (chartData: readonly NetWorthMetricData[], totalAlloc: number) => {
  const currentNW = chartData.length > 0 ? chartData[chartData.length - 1].value : totalAlloc;
  const prevNW = chartData.length > 1 ? chartData[chartData.length - 2].value : currentNW;
  const currentYear = new Date().getFullYear();
  const firstCurrentYearPoint = chartData.find((point) => point.year === currentYear);
  const firstNW =
    firstCurrentYearPoint?.value ?? (chartData.length > 0 ? chartData[0].value : currentNW);
  return {
    netWorth: currentNW,
    monthChange: currentNW - prevNW,
    ytdPct: firstNW > 0 ? ((currentNW - firstNW) / firstNW) * 100 : 0,
  };
};

export const buildMonthlySummaryItems = (
  income: number,
  expenses: number,
  fmtBase: DashboardFormatFn,
): MonthlySummaryItem[] => [
  {
    label: 'Total Income',
    value: fmtBase(income, undefined, true),
    icon: '\ud83d\udcb0',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-100',
  },
  {
    label: 'Total Expenses',
    value: fmtBase(expenses, undefined, true),
    icon: '\ud83d\udce4',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-100',
  },
  {
    label: 'Monthly Savings',
    value: fmtBase(income - expenses, undefined, true),
    icon: '\ud83c\udfe6',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-100',
  },
];

export function computeDashboardTxnStats(
  recentTransactions: readonly DashboardTransaction[],
): DashboardTxnStats {
  const { currentKey, prevKey } = getMonthKeys(new Date());
  const monthTxns = recentTransactions.filter((tx) => tx.date.startsWith(currentKey));
  const monthlyCategoryChange = (category: string) =>
    monthTxns
      .filter((tx) => tx.category === category)
      .reduce((sum, tx) => sum + (tx.type === 'transfer' ? -tx.amount : tx.amount), 0);
  const { monthlySalaryValue, monthlySalaryChange } = computeSalary(
    recentTransactions,
    currentKey,
    prevKey,
  );
  const totalIncome = recentTransactions
    .filter((tx) => tx.type === 'income')
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const totalExpenses = recentTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);
  return {
    monthlyCategoryChange,
    monthlySalaryValue,
    monthlySalaryChange,
    totalIncome,
    totalExpenses,
  };
}
