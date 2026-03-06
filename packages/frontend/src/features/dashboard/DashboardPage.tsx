import { LoadingSpinner } from '@/components/ui';
import { useGoals } from '@/features/goals/hooks';
import { parseGoalYear } from '@/features/goals/utils/goal-utils';
import { usePayslips } from '@/features/salary/hooks';
import { useAuth } from '@/lib/AuthContext';
import { useCurrency } from '@/lib/CurrencyContext';
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
} from './utils/dashboard-data';
import type { DashboardFormatFn } from './types';
import { useAssetAllocations, useDashboardTransactions, useNetWorthSnapshots } from './hooks';

const DASHBOARD_GOAL_LIMIT = 4;
const DASHBOARD_TXN_LIMIT = 6;

const computeAnnualGross = (payslips: ReadonlyArray<{ gross: number; date: string }>): number => {
  if (payslips.length === 0) return 0;
  const latest = [...payslips].sort((a, b) => b.date.localeCompare(a.date))[0];
  return (latest?.gross ?? 0) * 12;
};

function useDashboardData(fmtBase: DashboardFormatFn) {
  const { data: netWorthData = [], isLoading: loadingNW } = useNetWorthSnapshots();
  const { data: allocations = [], isLoading: loadingAlloc } = useAssetAllocations();
  const { data: recentTransactions = [], isLoading: loadingTxns } = useDashboardTransactions();
  const { data: goals = [], isLoading: loadingGoals } = useGoals();
  const { data: payslips = [], isLoading: loadingPayslips } = usePayslips();

  const isLoading = loadingNW || loadingAlloc || loadingTxns || loadingGoals || loadingPayslips;
  const currentYear = new Date().getFullYear();
  const annualGross = computeAnnualGross(payslips);
  const yearGoals = goals.filter((goal) => parseGoalYear(goal, currentYear) === currentYear);
  const chartData = netWorthData.map((snapshot) => ({
    month: snapshot.month,
    year: snapshot.year,
    value: snapshot.totalValue,
  }));
  const allocationData = allocations.map((allocation) => ({
    name: allocation.name,
    value: allocation.value,
    color: allocation.color,
  }));
  const totalAlloc = allocationData.reduce((sum, item) => sum + item.value, 0);
  const allocationByName = allocationData.reduce<Record<string, number>>((acc, item) => {
    acc[item.name] = item.value;
    return acc;
  }, {});

  const { netWorth, monthChange, ytdPct } = computeNWMetrics(chartData, totalAlloc);
  const {
    monthlyCategoryChange,
    monthlySalaryValue,
    monthlySalaryChange,
    totalIncome,
    totalExpenses,
  } = computeDashboardTxnStats(recentTransactions);

  return {
    isLoading,
    chartData,
    allocationData,
    totalAlloc,
    goals,
    recentTransactions,
    monthlySalaryValue,
    monthlyCategoryChange,
    monthlySalaryChange,
    allocationByName,
    netWorth,
    monthChange,
    ytdPct,
    annualGross,
    currentYear,
    displayedGoals: yearGoals.slice(0, DASHBOARD_GOAL_LIMIT),
    displayedRecentTransactions: [...recentTransactions]
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
    totalAlloc,
    monthlySalaryValue,
    monthlyCategoryChange,
    monthlySalaryChange,
    allocationByName,
    netWorth,
    monthChange,
    ytdPct,
  } = data;

  const hour = new Date().getHours();
  const dashboardCards = buildDashboardCards(
    allocationByName,
    monthlySalaryValue,
    monthlySalaryChange,
    monthlyCategoryChange,
  );

  return (
    <div className="p-6 space-y-6">
      <WelcomeBanner
        greeting={getGreeting(hour)}
        greetingName={userName}
        netWorth={netWorth}
        monthChange={monthChange}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
      />
      <DashboardStatCards cards={dashboardCards} fmtBase={fmtBase} />
      <DashboardChartsGrid
        chartData={chartData}
        allocationData={allocationData}
        totalAlloc={totalAlloc}
        baseCurrency={baseCurrency}
        ytdPct={ytdPct}
        fmtBase={fmtBase}
      />
      <DashboardBottomCards data={data} />
    </div>
  );
}

export function Dashboard() {
  const { fmtBase, baseCurrency } = useCurrency();
  const { user } = useAuth();
  const data = useDashboardData(fmtBase);

  if (data.isLoading) return <LoadingSpinner />;

  return (
    <DashboardPageBody
      data={data}
      userName={user?.name ?? 'there'}
      baseCurrency={baseCurrency}
      fmtBase={fmtBase}
    />
  );
}
