import { DATA_COLORS } from '@/lib/dataColors';
import { Briefcase, PiggyBank, ShieldCheck, TrendingUp } from 'lucide-react';
import type {
  AllocationKey,
  DashboardAllocationsSummary as DashboardAllocationSummaryPayload,
  DashboardTransaction as DashboardTransactionPayload,
  NetWorthSnapshot,
  Payslip,
} from '@quro/shared';
import type {
  AllocationSummary,
  DashboardCard,
  DashboardFormatFn,
  DashboardTransaction,
  DashboardTxnStats,
  MonthlySummaryItem,
  NetWorthMetricData,
} from '../types';

const ROLLING_SALARY_WINDOW_MONTHS = 12;

export const getGreeting = (hour: number): string => {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export const buildDashboardCards = (
  allocationByKey: Record<string, number>,
  monthlySalaryValue: number,
  salaryTrendChange: number,
  monthlyCategoryChange: (category: string) => number,
): DashboardCard[] => [
  {
    label: 'Total Savings',
    value: allocationByKey.savings ?? 0,
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
    value: allocationByKey.brokerage ?? 0,
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
    value: allocationByKey.pension ?? 0,
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
    isEstimated: snapshot.isEstimated,
  }));
}

const ALLOCATION_COLORS: Record<AllocationKey, string> = {
  savings: DATA_COLORS['primary'],
  brokerage: DATA_COLORS['cash'],
  property_equity: DATA_COLORS['income'],
  pension: DATA_COLORS['forecast'],
};

export function normalizeAssetAllocations(
  summary: DashboardAllocationSummaryPayload,
  convertToBase: (amount: number, currency: string) => number,
): AllocationSummary {
  const allocationData = summary.allocations.map((allocation) => ({
    key: allocation.key,
    name: allocation.name,
    value: convertToBase(allocation.value, allocation.currency),
    color: ALLOCATION_COLORS[allocation.key],
  }));
  const totalAssets = convertToBase(summary.totalAssets, summary.currency);
  const liabilitiesTotal = convertToBase(summary.liabilitiesTotal, summary.liabilitiesCurrency);

  return {
    allocationData,
    totalAssets,
    liabilitiesTotal,
    debtCount: summary.debtCount,
    netWorth: convertToBase(summary.netWorth, summary.currency),
    portfolioTotal: convertToBase(summary.portfolioTotal, summary.currency),
  };
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
    isJoint: transaction.isJoint ?? false,
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
  payslips: readonly Pick<Payslip, 'date' | 'net' | 'bonus' | 'currency'>[],
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

export const computeNWMetrics = (
  chartData: readonly NetWorthMetricData[],
  fallbackNetWorth: number,
  currentYear = new Date().getFullYear(),
) => {
  const currentNW = fallbackNetWorth;
  const prevNW = chartData.length > 1 ? chartData[chartData.length - 2].value : currentNW;
  const firstCurrentYearPoint = chartData.find((point) => point.year === currentYear);
  const firstNW =
    firstCurrentYearPoint?.value ?? (chartData.length > 0 ? chartData[0].value : currentNW);
  return {
    netWorth: currentNW,
    monthChange: currentNW - prevNW,
    ytdPct: firstNW > 0 ? ((currentNW - firstNW) / firstNW) * 100 : 0,
    isEstimated: chartData.at(-1)?.isEstimated ?? false,
  };
};

export const buildMonthlySummaryItems = (
  income: number,
  expenses: number,
  savingsDeposited: number,
  fmtBase: DashboardFormatFn,
): MonthlySummaryItem[] => [
  {
    label: 'Monthly Income',
    value: fmtBase(income, undefined, true),
    icon: '\ud83d\udcb0',
    bg: 'bg-success-soft',
    text: 'text-success-fg',
    border: 'border-success-soft-strong',
  },
  {
    label: 'Monthly Expenses',
    value: fmtBase(expenses, undefined, true),
    icon: '\ud83d\udce4',
    bg: 'bg-danger-soft',
    text: 'text-danger-fg',
    border: 'border-danger-soft-strong',
  },
  {
    label: 'Monthly Savings',
    value: fmtBase(savingsDeposited, undefined, true),
    icon: '\ud83c\udfe6',
    bg: 'bg-brand-soft',
    text: 'text-brand-fg',
    border: 'border-brand-soft-strong',
  },
];

const JOINT_TXN_WEIGHT = 0.5;

// Joint-account transactions count half in the monthly summary so the two
// partners' summaries add up to the real totals. Display rows keep the full
// amount; only these aggregates are weighted.
const weightedTxnAmount = (tx: DashboardTransaction): number =>
  tx.isJoint ? tx.amount * JOINT_TXN_WEIGHT : tx.amount;

export function computeDashboardTxnStats(
  transactions: readonly DashboardTransaction[],
  payslips: readonly Pick<Payslip, 'date' | 'net' | 'bonus' | 'currency'>[],
  convertToBase: (amount: number, currency: string) => number,
  currentKey = getMonthKey(new Date()),
): DashboardTxnStats {
  const monthTxns = transactions.filter((tx) => tx.date.startsWith(currentKey));
  const monthlyCategoryChange = (category: string) =>
    monthTxns
      .filter((tx) => tx.category === category)
      .reduce(
        (sum, tx) =>
          sum + (tx.type === 'transfer' ? -weightedTxnAmount(tx) : weightedTxnAmount(tx)),
        0,
      );
  const { monthlySalaryValue, salaryTrendChange } = computeSalaryMetrics(payslips, convertToBase);
  const totalIncome = monthTxns
    .filter((tx) => tx.type === 'income')
    .reduce((s, tx) => s + Math.abs(weightedTxnAmount(tx)), 0);
  const totalExpenses = monthTxns
    .filter((tx) => tx.type === 'expense')
    .reduce((s, tx) => s + Math.abs(weightedTxnAmount(tx)), 0);
  const totalSavingsDeposited = monthTxns
    .filter((tx) => tx.type === 'transfer' && tx.category === 'Savings')
    .reduce((s, tx) => s - weightedTxnAmount(tx), 0);
  return {
    monthlyCategoryChange,
    monthlySalaryValue,
    salaryTrendChange,
    totalIncome,
    totalExpenses,
    totalSavingsDeposited,
  };
}
