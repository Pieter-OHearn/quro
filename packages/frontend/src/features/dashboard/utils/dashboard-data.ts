import {
  householdAmount,
  sumMoney,
  type AllocationKey,
  type DashboardAllocationsSummary as DashboardAllocationSummaryPayload,
  type DashboardTransaction as DashboardTransactionPayload,
  type NetWorthSnapshot,
  type NetWorthYearStart,
  type Payslip,
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

export const buildDashboardCards = (
  allocationByKey: Record<string, number>,
  monthlySalaryValue: number,
  salaryTrendChange: number,
  monthlyCategoryChange: (category: string) => number,
): DashboardCard[] => [
  {
    label: 'Total savings',
    value: allocationByKey.savings ?? 0,
    change: {
      amount: monthlyCategoryChange('Savings'),
      label: 'this month',
    },
    path: '/savings',
  },
  {
    label: 'Investments',
    value: allocationByKey.brokerage ?? 0,
    change: {
      amount: monthlyCategoryChange('Investment'),
      label: 'this month',
    },
    path: '/investments',
  },
  {
    label: 'Pension',
    value: allocationByKey.pension ?? 0,
    change: {
      amount: monthlyCategoryChange('Pension'),
      label: 'this month',
    },
    path: '/pension',
  },
  {
    label: 'Monthly salary',
    value: monthlySalaryValue,
    change: {
      amount: salaryTrendChange,
      label: 'over 12 months',
    },
    path: '/salary',
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

// Chart colours are fixed per asset class (docs/design-v1.md): savings, investments, pension,
// property. Debt is drawn in `--viz-6` by the allocation card.
const ALLOCATION_COLORS: Record<AllocationKey, string> = {
  savings: 'var(--viz-1)',
  brokerage: 'var(--viz-2)',
  pension: 'var(--viz-3)',
  property_equity: 'var(--viz-4)',
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

/** Where "year to date" measures from, already converted to the display currency. */
export type YearStartValue = Pick<NetWorthYearStart, 'from' | 'month' | 'year' | 'isEstimated'> & {
  value: number;
};

export function toYearStartValue(
  yearStart: NetWorthYearStart | null,
  convertToBase: (amount: number, currency: string) => number,
): YearStartValue | null {
  if (!yearStart) return null;
  const { from, month, year, isEstimated } = yearStart;
  return {
    from,
    month,
    year,
    isEstimated,
    value: convertToBase(yearStart.totalValue, yearStart.currency),
  };
}

/**
 * The "year to date" change: from the previous year end, or from the household's first point of
 * this year when it has nothing before 1 January (the caption then names that month). A
 * percentage of a zero or negative starting value means nothing, so it is null and not shown.
 */
export function computeYearToDate(
  netWorth: number,
  yearStart: YearStartValue | null,
): { pct: number | null; caption: string } {
  const since =
    yearStart?.from === 'first-point'
      ? `since ${yearStart.month} ${yearStart.year}`
      : 'year to date';
  const caption = yearStart?.isEstimated ? `${since} (estimated)` : since;
  if (!yearStart || yearStart.value <= 0) return { pct: null, caption };
  return { pct: ((netWorth - yearStart.value) / yearStart.value) * 100, caption };
}

export const computeNWMetrics = (
  chartData: readonly NetWorthMetricData[],
  fallbackNetWorth: number,
  yearStart: YearStartValue | null = null,
) => {
  const currentNW = fallbackNetWorth;
  const prevNW = chartData.length > 1 ? chartData[chartData.length - 2].value : currentNW;
  const ytd = computeYearToDate(currentNW, yearStart);
  return {
    netWorth: currentNW,
    monthChange: currentNW - prevNW,
    ytdPct: ytd.pct,
    ytdCaption: ytd.caption,
    isEstimated: chartData.at(-1)?.isEstimated ?? false,
  };
};

export const buildMonthlySummaryItems = (
  income: number,
  expenses: number,
  savingsDeposited: number,
  fmtBase: DashboardFormatFn,
): MonthlySummaryItem[] => [
  { label: 'Monthly income', value: fmtBase(income, undefined, true) },
  { label: 'Monthly expenses', value: fmtBase(expenses, undefined, true) },
  { label: 'Monthly savings', value: fmtBase(savingsDeposited, undefined, true) },
];

// Joint-account transactions count at the household share in the monthly summary so the two
// partners' summaries add up to the real totals. Display rows keep the full amount; only these
// aggregates are weighted.
const weightedTxnAmount = (tx: DashboardTransaction): number =>
  householdAmount(tx.amount, tx.isJoint);

export function computeDashboardTxnStats(
  transactions: readonly DashboardTransaction[],
  payslips: readonly Pick<Payslip, 'date' | 'net' | 'bonus' | 'currency'>[],
  convertToBase: (amount: number, currency: string) => number,
  currentKey = getMonthKey(new Date()),
): DashboardTxnStats {
  const monthTxns = transactions.filter((tx) => tx.date.startsWith(currentKey));
  const monthlyCategoryChange = (category: string) =>
    sumMoney(
      monthTxns
        .filter((tx) => tx.category === category)
        .map((tx) => (tx.type === 'transfer' ? -weightedTxnAmount(tx) : weightedTxnAmount(tx))),
    );
  const { monthlySalaryValue, salaryTrendChange } = computeSalaryMetrics(payslips, convertToBase);
  const totalIncome = sumMoney(
    monthTxns.filter((tx) => tx.type === 'income').map((tx) => Math.abs(weightedTxnAmount(tx))),
  );
  const totalExpenses = sumMoney(
    monthTxns.filter((tx) => tx.type === 'expense').map((tx) => Math.abs(weightedTxnAmount(tx))),
  );
  const totalSavingsDeposited = sumMoney(
    monthTxns
      .filter((tx) => tx.type === 'transfer' && tx.category === 'Savings')
      .map((tx) => -weightedTxnAmount(tx)),
  );
  return {
    monthlyCategoryChange,
    monthlySalaryValue,
    salaryTrendChange,
    totalIncome,
    totalExpenses,
    totalSavingsDeposited,
  };
}
