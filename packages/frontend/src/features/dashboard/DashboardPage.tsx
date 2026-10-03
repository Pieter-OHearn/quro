import { useMemo } from 'react';
import { RouteQueryErrorState } from '@/components/errors/RouteQueryErrorState';
import { ContentSection, LoadingSpinner, PageStack } from '@/components/ui';
import { useGoals } from '@/features/goals/hooks';
import type { GoalProgressContext } from '@/features/goals/types';
import { parseGoalYear } from '@/features/goals/utils/goal-utils';
import { useSavingsAccounts } from '@/features/savings/hooks';
import type {
  DashboardAllocationsSummary,
  DashboardInsights,
  DashboardTransaction,
  Goal,
  NetWorthSnapshot,
  SavingsAccount,
} from '@quro/shared';
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
import {
  useAssetAllocations,
  useDashboardTransactions,
  useDashboardInsights,
  useNetWorthSnapshots,
} from './hooks';

const DASHBOARD_GOAL_LIMIT = 4;
const DASHBOARD_TXN_LIMIT = 6;
const MONTH_KEY_PAD_LENGTH = 2;
const EMPTY_ALLOCATIONS_SUMMARY: DashboardAllocationsSummary = {
  allocations: [],
  currency: 'EUR',
  liabilitiesCurrency: 'EUR',
  netWorth: 0,
  portfolioTotal: 0,
  totalAssets: 0,
  liabilitiesTotal: 0,
  debtCount: 0,
};

const EMPTY_NET_WORTH: NetWorthSnapshot[] = [];
const EMPTY_TRANSACTIONS: DashboardTransaction[] = [];
const EMPTY_GOALS: Goal[] = [];
const EMPTY_SAVINGS: SavingsAccount[] = [];
const EMPTY_INSIGHTS: DashboardInsights = {
  latestPayslip: null,
  salaryMonths: [],
  investHabitBuyMonths: [],
};

const buildAllocationsByKey = (allocationData: ReadonlyArray<{ key: string; value: number }>) =>
  allocationData.reduce<Record<string, number>>((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});

const buildMonthKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(MONTH_KEY_PAD_LENGTH, '0')}`;

function useDashboardQueries(currentYear: number) {
  const netWorthQuery = useNetWorthSnapshots();
  const allocationsQuery = useAssetAllocations();
  const transactionsQuery = useDashboardTransactions();
  const goalsQuery = useGoals();
  const insightsQuery = useDashboardInsights(currentYear);
  const savingsAccountsQuery = useSavingsAccounts();
  const routeQueries = [
    { label: 'net worth history', ...netWorthQuery },
    { label: 'asset allocations', ...allocationsQuery },
    { label: 'recent dashboard activity', ...transactionsQuery },
    { label: 'goal progress', ...goalsQuery },
    { label: 'salary and investing summaries', ...insightsQuery },
    { label: 'savings accounts', ...savingsAccountsQuery },
  ];

  return {
    netWorthQuery,
    allocationsQuery,
    transactionsQuery,
    goalsQuery,
    insightsQuery,
    savingsAccountsQuery,
    isLoading: routeQueries.some((query) => query.isLoading),
    queryFailures: getFailedRouteQueries(routeQueries),
  };
}

type DashboardQueries = ReturnType<typeof useDashboardQueries>;

function getDashboardQueryData(queries: DashboardQueries) {
  return {
    netWorthData: queries.netWorthQuery.data ?? EMPTY_NET_WORTH,
    allocations: queries.allocationsQuery.data ?? EMPTY_ALLOCATIONS_SUMMARY,
    transactions: queries.transactionsQuery.data ?? EMPTY_TRANSACTIONS,
    goals: queries.goalsQuery.data ?? EMPTY_GOALS,
    insights: queries.insightsQuery.data ?? EMPTY_INSIGHTS,
    savingsAccounts: queries.savingsAccountsQuery.data ?? EMPTY_SAVINGS,
  };
}

function useDashboardData(
  fmtBase: DashboardFormatFn,
  convertToBase: (amount: number, currency: string) => number,
) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthKey = buildMonthKey(today);
  const queries = useDashboardQueries(currentYear);
  const { netWorthData, allocations, transactions, goals, insights, savingsAccounts } =
    getDashboardQueryData(queries);
  const derived = useMemo(
    () =>
      deriveDashboardData({
        netWorthData,
        allocations,
        transactions,
        goals,
        insights,
        savingsAccounts,
        currentYear,
        currentMonthKey,
        convertToBase,
        fmtBase,
      }),
    [
      netWorthData,
      allocations,
      transactions,
      goals,
      insights,
      savingsAccounts,
      currentYear,
      currentMonthKey,
      convertToBase,
      fmtBase,
    ],
  );
  return { ...derived, isLoading: queries.isLoading, queryFailures: queries.queryFailures };
}

function deriveDashboardData({
  netWorthData,
  allocations,
  transactions,
  goals,
  insights,
  savingsAccounts,
  currentYear,
  currentMonthKey,
  convertToBase,
  fmtBase,
}: ReturnType<typeof getDashboardQueryData> & {
  currentYear: number;
  currentMonthKey: string;
  convertToBase: GoalProgressContext['convertToBase'];
  fmtBase: DashboardFormatFn;
}) {
  const latest = insights.latestPayslip;
  const annualGross = latest ? convertToBase(latest.gross * 12, latest.currency) : 0;
  const yearGoals = goals.filter((goal) => parseGoalYear(goal, currentYear) === currentYear);
  const convertedTransactions = normalizeDashboardTransactions(transactions, convertToBase);
  const currentMonthTransactions = convertedTransactions.filter((tx) =>
    tx.date.startsWith(currentMonthKey),
  );
  const chartData = normalizeNetWorthSnapshots(netWorthData, convertToBase);
  const allocationSummary = normalizeAssetAllocations(allocations, convertToBase);
  const allocationByKey = buildAllocationsByKey(allocationSummary.allocationData);
  const goalProgressContext: GoalProgressContext = {
    annualGross,
    savingsAccounts,
    portfolioTotal: allocationSummary.portfolioTotal,
    netWorth: allocationSummary.netWorth,
    investHabitBuyMonths: new Map([[currentYear, new Set(insights.investHabitBuyMonths)]]),
    convertToBase,
  };
  const nwMetrics = computeNWMetrics(chartData, allocationSummary.netWorth, currentYear);
  const {
    monthlyCategoryChange,
    monthlySalaryValue,
    salaryTrendChange,
    totalIncome,
    totalExpenses,
    totalSavingsDeposited,
  } = computeDashboardTxnStats(
    convertedTransactions,
    insights.salaryMonths,
    convertToBase,
    currentMonthKey,
  );
  return {
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
    allocationByKey,
    ...nwMetrics,
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
    allocationByKey,
    netWorth,
    monthChange,
    ytdPct,
    isEstimated,
  } = data;

  const hour = new Date().getHours();
  const dashboardCards = buildDashboardCards(
    allocationByKey,
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
          netWorth={netWorth}
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
