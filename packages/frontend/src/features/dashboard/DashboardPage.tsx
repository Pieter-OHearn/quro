import { useMemo } from 'react';
import { RouteQueryErrorState } from '@/components/errors/RouteQueryErrorState';
import { ContentSection, LoadingSpinner, PageStack } from '@/components/ui';
import { useGoals } from '@/features/goals/hooks';
import type { GoalProgressContext } from '@/features/goals/types';
import { parseGoalYear } from '@/features/goals/utils/goal-utils';
import { useHoldingTransactions } from '@/features/investments/hooks';
import { usePayslips } from '@/features/salary/hooks';
import { useSavingsAccounts } from '@/features/savings/hooks';
import type { DashboardAllocationsSummary, HoldingTransaction } from '@quro/shared';
import { useAuth } from '@/lib/AuthContext';
import { useCurrency } from '@/lib/CurrencyContext';
import { getFailedRouteQueries } from '@/lib/routeQueryErrors';
import { getUserDisplayName } from '@/lib/user';
import {
  DashboardChartsGrid,
  DashboardStatCards,
  GoalsOverviewCard,
  MonthlySummary,
  RecentTransactionsCard,
  WelcomeBanner,
} from './components';
import {
  buildDashboardCards,
  buildMonthlySummaryItems,
  computeDashboardTxnStats,
  computeNWMetrics,
  getGreeting,
  normalizeAssetAllocations,
  normalizeDashboardTransactions,
  normalizeNetWorthSnapshots,
} from './utils/dashboard-data';
import type { DashboardFormatFn } from './types';
import { useAssetAllocations, useDashboardTransactions, useNetWorthSnapshots } from './hooks';

const DASHBOARD_GOAL_LIMIT = 4;
const DASHBOARD_TXN_LIMIT = 6;
const MONTH_KEY_PAD_LENGTH = 2;
const EMPTY_ALLOCATIONS_SUMMARY: DashboardAllocationsSummary = {
  allocations: [],
  liabilitiesTotal: 0,
  debtCount: 0,
};

const computeAnnualGross = (
  payslips: ReadonlyArray<{ gross: number; date: string; currency: string }>,
  convertToBase: (amount: number, currency: string) => number,
): number => {
  if (payslips.length === 0) return 0;
  const latest = [...payslips].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return 0;
  return convertToBase(latest.gross * 12, latest.currency);
};

const buildAllocationsByName = (allocationData: ReadonlyArray<{ name: string; value: number }>) =>
  allocationData.reduce<Record<string, number>>((acc, item) => {
    acc[item.name] = item.value;
    return acc;
  }, {});

const buildMonthKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(MONTH_KEY_PAD_LENGTH, '0')}`;

function computeInvestHabitBuyMonths(
  holdingTxns: readonly HoldingTransaction[],
): ReadonlyMap<number, ReadonlySet<string>> {
  const yearMap = new Map<number, Set<string>>();
  for (const txn of holdingTxns) {
    if (txn.type !== 'buy' || !txn.date) continue;
    const date = new Date(txn.date + 'T00:00:00Z');
    const year = date.getUTCFullYear();
    const monthKey = `${year}-${String(date.getUTCMonth() + 1).padStart(MONTH_KEY_PAD_LENGTH, '0')}`;
    let months = yearMap.get(year);
    if (!months) {
      months = new Set();
      yearMap.set(year, months);
    }
    months.add(monthKey);
  }
  return yearMap;
}

function useDashboardQueries() {
  const netWorthQuery = useNetWorthSnapshots();
  const allocationsQuery = useAssetAllocations();
  const transactionsQuery = useDashboardTransactions();
  const goalsQuery = useGoals();
  const payslipsQuery = usePayslips();
  const savingsAccountsQuery = useSavingsAccounts();
  const holdingTxnsQuery = useHoldingTransactions();
  const routeQueries = [
    { label: 'net worth history', ...netWorthQuery },
    { label: 'asset allocations', ...allocationsQuery },
    { label: 'recent dashboard activity', ...transactionsQuery },
    { label: 'goal progress', ...goalsQuery },
    { label: 'payslips', ...payslipsQuery },
    { label: 'savings accounts', ...savingsAccountsQuery },
    { label: 'holding transactions', ...holdingTxnsQuery },
  ];

  return {
    netWorthQuery,
    allocationsQuery,
    transactionsQuery,
    goalsQuery,
    payslipsQuery,
    savingsAccountsQuery,
    holdingTxnsQuery,
    isLoading: routeQueries.some((query) => query.isLoading),
    queryFailures: getFailedRouteQueries(routeQueries),
  };
}

type DashboardQueries = ReturnType<typeof useDashboardQueries>;

function getDashboardQueryData(queries: DashboardQueries) {
  return {
    netWorthData: queries.netWorthQuery.data ?? [],
    allocations: queries.allocationsQuery.data ?? EMPTY_ALLOCATIONS_SUMMARY,
    transactions: queries.transactionsQuery.data ?? [],
    goals: queries.goalsQuery.data ?? [],
    payslips: queries.payslipsQuery.data ?? [],
    savingsAccounts: queries.savingsAccountsQuery.data ?? [],
    holdingTxns: queries.holdingTxnsQuery.data ?? [],
  };
}

function useDashboardData(
  fmtBase: DashboardFormatFn,
  convertToBase: (amount: number, currency: string) => number,
) {
  const queries = useDashboardQueries();
  const { netWorthData, allocations, transactions, goals, payslips, savingsAccounts, holdingTxns } =
    getDashboardQueryData(queries);
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthKey = buildMonthKey(today);
  const annualGross = computeAnnualGross(payslips, convertToBase);
  const yearGoals = goals.filter((goal) => parseGoalYear(goal, currentYear) === currentYear);
  const convertedTransactions = normalizeDashboardTransactions(transactions, convertToBase);
  const currentMonthTransactions = convertedTransactions.filter((tx) =>
    tx.date.startsWith(currentMonthKey),
  );
  const chartData = normalizeNetWorthSnapshots(netWorthData, convertToBase);
  const allocationSummary = normalizeAssetAllocations(allocations, convertToBase);
  const allocationByName = buildAllocationsByName(allocationSummary.allocationData);
  const investHabitBuyMonths = useMemo(
    () => computeInvestHabitBuyMonths(holdingTxns),
    [holdingTxns],
  );
  const goalProgressContext: GoalProgressContext = {
    annualGross,
    savingsAccounts,
    portfolioTotal: allocationByName['Brokerage'] ?? 0,
    netWorth: allocationSummary.netWorth,
    investHabitBuyMonths,
    convertToBase,
  };

  const { netWorth, monthChange, ytdPct, isEstimated } = computeNWMetrics(
    chartData,
    allocationSummary.netWorth,
  );
  const {
    monthlyCategoryChange,
    monthlySalaryValue,
    salaryTrendChange,
    totalIncome,
    totalExpenses,
    totalSavingsDeposited,
  } = computeDashboardTxnStats(convertedTransactions, payslips, convertToBase);

  return {
    isLoading: queries.isLoading,
    queryFailures: queries.queryFailures,
    chartData,
    allocationData: allocationSummary.allocationData,
    totalAssets: allocationSummary.totalAssets,
    liabilitiesTotal: allocationSummary.liabilitiesTotal,
    debtCount: allocationSummary.debtCount,
    goals,
    recentTransactions: convertedTransactions,
    monthlySalaryValue,
    monthlyCategoryChange,
    salaryTrendChange,
    allocationByName,
    netWorth,
    monthChange,
    ytdPct,
    isEstimated,
    annualGross,
    goalProgressContext,
    currentYear,
    displayedGoals: yearGoals.slice(0, DASHBOARD_GOAL_LIMIT),
    displayedRecentTransactions: [...currentMonthTransactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, DASHBOARD_TXN_LIMIT),
    monthlySummaryItems: buildMonthlySummaryItems(
      totalIncome,
      totalExpenses,
      totalSavingsDeposited,
      fmtBase,
    ),
  };
}

type DashboardData = ReturnType<typeof useDashboardData>;

type DashboardPageBodyProps = {
  data: DashboardData;
  userName: string;
  baseCurrency: string;
  fmtBase: DashboardFormatFn;
};

function DashboardBottomCards({ data }: { data: DashboardData }) {
  const { fmtBase, baseCurrency } = useCurrency();
  const {
    displayedRecentTransactions,
    displayedGoals,
    recentTransactions,
    monthlySummaryItems,
    goalProgressContext,
    currentYear,
  } = data;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTransactionsCard
          transactions={displayedRecentTransactions}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
        />
        <GoalsOverviewCard
          goals={displayedGoals}
          goalProgressContext={goalProgressContext}
          currentYear={currentYear}
          fmtBase={fmtBase}
        />
      </div>
      {recentTransactions.length > 0 && <MonthlySummary items={monthlySummaryItems} />}
    </>
  );
}

function DashboardPageBody({
  data,
  userName,
  baseCurrency,
  fmtBase,
}: Readonly<DashboardPageBodyProps>) {
  const {
    chartData,
    allocationData,
    totalAssets,
    liabilitiesTotal,
    debtCount,
    monthlySalaryValue,
    monthlyCategoryChange,
    salaryTrendChange,
    allocationByName,
    netWorth,
    monthChange,
    ytdPct,
    isEstimated,
  } = data;

  const hour = new Date().getHours();
  const dashboardCards = buildDashboardCards(
    allocationByName,
    monthlySalaryValue,
    salaryTrendChange,
    monthlyCategoryChange,
  );

  return (
    <PageStack>
      <ContentSection>
        <WelcomeBanner
          greeting={getGreeting(hour)}
          greetingName={userName}
          netWorth={netWorth}
          monthChange={monthChange}
          totalAssets={totalAssets}
          liabilitiesTotal={liabilitiesTotal}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
          isEstimated={isEstimated}
        />
      </ContentSection>
      <ContentSection>
        <DashboardStatCards
          cards={dashboardCards}
          liabilitiesValue={liabilitiesTotal}
          debtCount={debtCount}
          fmtBase={fmtBase}
        />
      </ContentSection>
      <ContentSection>
        <DashboardChartsGrid
          chartData={chartData}
          allocationData={allocationData}
          totalAlloc={totalAssets}
          liabilitiesTotal={liabilitiesTotal}
          baseCurrency={baseCurrency}
          ytdPct={ytdPct}
          fmtBase={fmtBase}
        />
      </ContentSection>
      <ContentSection spacing="lg">
        <DashboardBottomCards data={data} />
      </ContentSection>
    </PageStack>
  );
}

export function Dashboard() {
  const { fmtBase, baseCurrency, convertToBase } = useCurrency();
  const { user } = useAuth();
  const data = useDashboardData(fmtBase, convertToBase);

  if (data.isLoading) return <LoadingSpinner />;
  if (data.queryFailures.length > 0) {
    return <RouteQueryErrorState routeName="Dashboard" failedQueries={data.queryFailures} />;
  }

  return (
    <DashboardPageBody
      data={data}
      userName={getUserDisplayName(user, 'there')}
      baseCurrency={baseCurrency}
      fmtBase={fmtBase}
    />
  );
}
