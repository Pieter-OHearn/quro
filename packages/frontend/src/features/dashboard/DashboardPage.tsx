import { LoadingSpinner } from '@/components/ui';
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
  deriveGoalDisplay,
  getGreeting,
} from './utils/dashboard-data';
import type { DashboardFormatFn } from './types';
import {
  useAssetAllocations,
  useDashboardTransactions,
  useGoalsSummary,
  useNetWorthSnapshots,
} from './hooks';

function useDashboardData(fmtBase: DashboardFormatFn) {
  const { data: netWorthData = [], isLoading: loadingNW } = useNetWorthSnapshots();
  const { data: allocations = [], isLoading: loadingAlloc } = useAssetAllocations();
  const { data: recentTransactions = [], isLoading: loadingTxns } = useDashboardTransactions();
  const { data: goals = [], isLoading: loadingGoals } = useGoalsSummary();

  const isLoading = loadingNW || loadingAlloc || loadingTxns || loadingGoals;
  const chartData = netWorthData.map((snapshot) => ({
    month: snapshot.month,
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
    displayedGoals: goals.map((goal) => deriveGoalDisplay(goal, monthlySalaryValue)).slice(0, 4),
    displayedRecentTransactions: [...recentTransactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6),
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
  const { displayedRecentTransactions, displayedGoals, recentTransactions, monthlySummaryItems } =
    data;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTransactionsCard
          transactions={displayedRecentTransactions}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
        />
        <GoalsOverviewCard goals={displayedGoals} fmtBase={fmtBase} />
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
