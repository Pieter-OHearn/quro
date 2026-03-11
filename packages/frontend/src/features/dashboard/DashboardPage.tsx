import { ContentSection, LoadingSpinner, PageStack } from '@/components/ui';
import { useGoals } from '@/features/goals/hooks';
import { parseGoalYear } from '@/features/goals/utils/goal-utils';
import { usePayslips } from '@/features/salary/hooks';
import type { DashboardAllocationsSummary } from '@quro/shared';
import { useAuth } from '@/lib/AuthContext';
import { useCurrency } from '@/lib/CurrencyContext';
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

function useDashboardData(
  fmtBase: DashboardFormatFn,
  convertToBase: (amount: number, currency: string) => number,
) {
  const { data: netWorthData = [], isLoading: loadingNW } = useNetWorthSnapshots();
  const { data: allocations = EMPTY_ALLOCATIONS_SUMMARY, isLoading: loadingAlloc } =
    useAssetAllocations();
  const { data: transactions = [], isLoading: loadingTxns } = useDashboardTransactions();
  const { data: goals = [], isLoading: loadingGoals } = useGoals();
  const { data: payslips = [], isLoading: loadingPayslips } = usePayslips();

  const isLoading = loadingNW || loadingAlloc || loadingTxns || loadingGoals || loadingPayslips;
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const annualGross = computeAnnualGross(payslips, convertToBase);
  const yearGoals = goals.filter((goal) => parseGoalYear(goal, currentYear) === currentYear);
  const convertedTransactions = normalizeDashboardTransactions(transactions, convertToBase);
  const currentMonthTransactions = convertedTransactions.filter((tx) =>
    tx.date.startsWith(currentMonthKey),
  );
  const chartData = normalizeNetWorthSnapshots(netWorthData, convertToBase);
  const allocationSummary = normalizeAssetAllocations(allocations, convertToBase);
  const allocationByName = allocationSummary.allocationData.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.name] = item.value;
      return acc;
    },
    {},
  );

  const { netWorth, monthChange, ytdPct } = computeNWMetrics(chartData, allocationSummary.netWorth);
  const {
    monthlyCategoryChange,
    monthlySalaryValue,
    salaryTrendChange,
    totalIncome,
    totalExpenses,
  } = computeDashboardTxnStats(convertedTransactions, payslips, convertToBase);

  return {
    isLoading,
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
    annualGross,
    currentYear,
    displayedGoals: yearGoals.slice(0, DASHBOARD_GOAL_LIMIT),
    displayedRecentTransactions: [...currentMonthTransactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, DASHBOARD_TXN_LIMIT),
    monthlySummaryItems: buildMonthlySummaryItems(totalIncome, totalExpenses, fmtBase),
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
    annualGross,
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
          annualGross={annualGross}
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

  return (
    <DashboardPageBody
      data={data}
      userName={getUserDisplayName(user, 'there')}
      baseCurrency={baseCurrency}
      fmtBase={fmtBase}
    />
  );
}
