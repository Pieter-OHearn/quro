import { Briefcase, PiggyBank, ShieldCheck, TrendingUp } from 'lucide-react';
import type {
  AssetAllocation as DashboardAllocationPayload,
  DashboardTransaction as DashboardTransactionPayload,
  NetWorthSnapshot,
  Payslip,
} from '@quro/shared';
import type {
  AllocationItem,
  DashboardCard,
  DashboardFormatFn,
  DashboardTransaction,
  DashboardTxnStats,
  GoalDisplay,
  GoalSummaryItem,
  MonthlySummaryItem,
  NetWorthMetricData,
} from '../types';

const ROLLING_SALARY_WINDOW_MONTHS = 12;

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
  salaryTrendChange: number,
  monthlyCategoryChange: (category: string) => number,
): DashboardCard[] => [
  {
    label: 'Total Savings',
    value: allocationByName.Savings ?? 0,
    change: {
      amount: monthlyCategoryChange('Savings'),
      label: 'this month',
    },
    icon: PiggyBank,
    path: '/savings',
    color: 'indigo',
  },
  {
    label: 'Investments',
    value: allocationByName.Brokerage ?? 0,
    change: {
      amount: monthlyCategoryChange('Investment'),
      label: 'this month',
    },
    icon: TrendingUp,
    path: '/investments',
    color: 'sky',
  },
  {
    label: 'Pension',
    value: allocationByName.Pension ?? 0,
    change: {
      amount: monthlyCategoryChange('Pension'),
      label: 'this month',
    },
    icon: ShieldCheck,
    path: '/pension',
    color: 'amber',
  },
  {
    label: 'Monthly Salary',
    value: monthlySalaryValue,
    change: {
      amount: salaryTrendChange,
      label: 'over 12 months',
    },
    icon: Briefcase,
    path: '/salary',
    color: 'emerald',
  },
];

export function normalizeNetWorthSnapshots(
  snapshots: readonly NetWorthSnapshot[],
  convertToBase: (amount: number, currency: string) => number,
): NetWorthMetricData[] {
  return snapshots.map((snapshot) => ({
    month: snapshot.month,
    year: snapshot.year,
    value: convertToBase(snapshot.totalValue, snapshot.currency),
  }));
}

export function normalizeAssetAllocations(
  allocations: readonly DashboardAllocationPayload[],
  convertToBase: (amount: number, currency: string) => number,
): AllocationItem[] {
  return allocations.map((allocation) => ({
    name: allocation.name,
    value: convertToBase(allocation.value, allocation.currency),
    color: allocation.color,
  }));
}

export function normalizeDashboardTransactions(
  transactions: readonly DashboardTransactionPayload[],
  convertToBase: (amount: number, currency: string) => number,
): DashboardTransaction[] {
  return transactions.map((transaction) => ({
    id: transaction.id,
    name: transaction.name,
    category: transaction.category,
    date: transaction.date,
    type: transaction.type,
    amount: convertToBase(transaction.amount, transaction.currency),
  }));
}

const getMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const formatMonthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const addUtcMonths = (date: Date, delta: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));

const toMonthStartUtc = (monthKey: string) => new Date(`${monthKey}-01T00:00:00Z`);

const getPayslipMonthlyAmount = (payslip: Pick<Payslip, 'net' | 'bonus'>) =>
  payslip.net + (payslip.bonus ?? 0);

const computeSalaryMetrics = (
  payslips: readonly Payslip[],
  convertToBase: (amount: number, currency: string) => number,
) => {
  if (payslips.length === 0) {
    return { monthlySalaryValue: 0, salaryTrendChange: 0 };
  }

  const monthlyTotals = payslips.reduce((totals, payslip) => {
    const monthKey = payslip.date.slice(0, 7);
    totals.set(
      monthKey,
      (totals.get(monthKey) ?? 0) +
        convertToBase(getPayslipMonthlyAmount(payslip), payslip.currency),
    );
    return totals;
  }, new Map<string, number>());

  const sortedMonthKeys = [...monthlyTotals.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  const latestMonthKey = sortedMonthKeys[sortedMonthKeys.length - 1];
  const latestMonthStart = toMonthStartUtc(latestMonthKey);
  const preferredBaselineKey = formatMonthKey(
    addUtcMonths(latestMonthStart, -ROLLING_SALARY_WINDOW_MONTHS),
  );
  const fallbackBaselineLimit = formatMonthKey(
    addUtcMonths(latestMonthStart, -(ROLLING_SALARY_WINDOW_MONTHS - 1)),
  );
  const fallbackBaselineKey =
    sortedMonthKeys.find(
      (monthKey) => monthKey >= fallbackBaselineLimit && monthKey < latestMonthKey,
    ) ?? null;
  const baselineMonthKey = monthlyTotals.has(preferredBaselineKey)
    ? preferredBaselineKey
    : fallbackBaselineKey;
  const monthlySalaryValue = monthlyTotals.get(latestMonthKey) ?? 0;
  const baselineValue = baselineMonthKey == null ? 0 : (monthlyTotals.get(baselineMonthKey) ?? 0);

  return {
    monthlySalaryValue,
    salaryTrendChange: baselineValue > 0 ? monthlySalaryValue - baselineValue : 0,
  };
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
  transactions: readonly DashboardTransaction[],
  payslips: readonly Payslip[],
  convertToBase: (amount: number, currency: string) => number,
): DashboardTxnStats {
  const currentKey = getMonthKey(new Date());
  const monthTxns = transactions.filter((tx) => tx.date.startsWith(currentKey));
  const monthlyCategoryChange = (category: string) =>
    monthTxns
      .filter((tx) => tx.category === category)
      .reduce((sum, tx) => sum + (tx.type === 'transfer' ? -tx.amount : tx.amount), 0);
  const { monthlySalaryValue, salaryTrendChange } = computeSalaryMetrics(payslips, convertToBase);
  const totalIncome = monthTxns
    .filter((tx) => tx.type === 'income')
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const totalExpenses = monthTxns
    .filter((tx) => tx.type === 'expense')
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);
  return {
    monthlyCategoryChange,
    monthlySalaryValue,
    salaryTrendChange,
    totalIncome,
    totalExpenses,
  };
}
