import { Link } from 'react-router';
import { PieChart, Pie, Cell } from 'recharts';
import {
  TrendingUp,
  PiggyBank,
  Briefcase,
  ArrowRight,
  CreditCard,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';
import { AreaChartCard, LoadingSpinner, StatCard } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { useAuth } from '@/lib/AuthContext';
import {
  useNetWorthSnapshots,
  useAssetAllocations,
  useDashboardTransactions,
  useGoalsSummary,
} from './hooks';

type DashboardTransaction = {
  id: string | number;
  name: string;
  category: string;
  date: string;
  type: string;
  amount: number;
};

type AllocationItem = {
  name: string;
  value: number;
  color: string;
};

type GoalDisplay = {
  name: string;
  current: number;
  target: number;
  color: string;
  icon: string;
};

type MonthlySummaryItem = {
  label: string;
  value: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
};

// ─── Greeting helpers ─────────────────────────────────────────────────────────

const getGreeting = (hour: number): string => {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function WelcomeBanner({
  greeting,
  greetingName,
  netWorth,
  monthChange,
  baseCurrency,
  fmtBase,
}: Readonly<{
  greeting: string;
  greetingName: string;
  netWorth: number;
  monthChange: number;
  baseCurrency: string;
  fmtBase: (n: number) => string;
}>) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-[#0a0f1e] via-[#1a1f3e] to-[#1e1448] p-6 text-white overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 right-24 w-40 h-40 bg-purple-500/10 rounded-full translate-y-1/2" />
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-indigo-300 text-sm mb-1">
            {greeting}, {greetingName}
          </p>
          <h2 className="text-2xl font-bold">Your Financial Overview</h2>
          <p className="text-slate-400 text-sm mt-1">Base currency: {baseCurrency}</p>
        </div>
        <NetWorthBadge netWorth={netWorth} monthChange={monthChange} fmtBase={fmtBase} />
      </div>
    </div>
  );
}

function NetWorthBadge({
  netWorth,
  monthChange,
  fmtBase,
}: Readonly<{
  netWorth: number;
  monthChange: number;
  fmtBase: (n: number) => string;
}>) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-4 text-center flex-shrink-0">
      <p className="text-indigo-300 text-xs uppercase tracking-widest mb-1">Net Worth</p>
      <p className="text-3xl font-bold">{fmtBase(netWorth)}</p>
      {monthChange !== 0 && (
        <div className="flex items-center justify-center gap-1 mt-1">
          {monthChange >= 0 ? (
            <TrendingUp size={13} className="text-emerald-400" />
          ) : (
            <TrendingDown size={13} className="text-rose-400" />
          )}
          <span className={`text-xs ${monthChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {monthChange >= 0 ? '+' : ''}
            {fmtBase(monthChange)} this month
          </span>
        </div>
      )}
    </div>
  );
}

function AllocationPieChart({ data }: Readonly<{ data: readonly AllocationItem[] }>) {
  return (
    <div className="flex justify-center mb-4">
      <PieChart width={160} height={160}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={75}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
    </div>
  );
}

function AllocationLegend({
  data,
  totalAlloc,
  fmtBase,
}: Readonly<{
  data: readonly AllocationItem[];
  totalAlloc: number;
  fmtBase: (n: number) => string;
}>) {
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.name} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-slate-600">{item.name}</span>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-slate-800">{fmtBase(item.value)}</span>
            <span className="text-[10px] text-slate-400 ml-1">
              {totalAlloc > 0 ? ((item.value / totalAlloc) * 100).toFixed(0) : 0}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AssetAllocationCard({
  allocationData,
  totalAlloc,
  baseCurrency,
  fmtBase,
}: Readonly<{
  allocationData: readonly AllocationItem[];
  totalAlloc: number;
  baseCurrency: string;
  fmtBase: (n: number) => string;
}>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Asset Allocation</h3>
      <p className="text-xs text-slate-400 mb-4">All values in {baseCurrency}</p>
      {allocationData.length > 0 ? (
        <>
          <AllocationPieChart data={allocationData} />
          <AllocationLegend data={allocationData} totalAlloc={totalAlloc} fmtBase={fmtBase} />
        </>
      ) : (
        <p className="text-sm text-slate-400 py-12 text-center">No allocation data yet.</p>
      )}
    </div>
  );
}

const txIconClass = (type: string) => {
  if (type === 'income') return 'bg-emerald-50 text-emerald-600';
  if (type === 'transfer') return 'bg-indigo-50 text-indigo-600';
  return 'bg-slate-100 text-slate-500';
};

function TransactionItem({
  tx,
  fmtBase,
}: Readonly<{
  tx: DashboardTransaction;
  fmtBase: (n: number, u?: undefined, c?: boolean) => string;
}>) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${txIconClass(tx.type)}`}
        >
          <CreditCard size={15} />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800">{tx.name}</p>
          <p className="text-xs text-slate-400">
            {tx.category} · {tx.date}
          </p>
        </div>
      </div>
      <span
        className={`text-sm font-semibold ${tx.amount > 0 ? 'text-emerald-600' : 'text-slate-700'}`}
      >
        {tx.amount > 0 ? '+' : ''}
        {fmtBase(Math.abs(tx.amount), undefined, true)}
      </span>
    </div>
  );
}

function RecentTransactionsCard({
  transactions,
  baseCurrency,
  fmtBase,
}: Readonly<{
  transactions: readonly DashboardTransaction[];
  baseCurrency: string;
  fmtBase: (n: number, u?: undefined, c?: boolean) => string;
}>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-slate-900">Recent Transactions</h3>
          <p className="text-xs text-slate-400 mt-0.5">This month in {baseCurrency}</p>
        </div>
        <Link
          to="/budget"
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>
      {transactions.length > 0 ? (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <TransactionItem key={tx.id} tx={tx} fmtBase={fmtBase} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">No transactions yet.</p>
      )}
    </div>
  );
}

function GoalProgressItem({
  goal,
  fmtBase,
}: Readonly<{
  goal: GoalDisplay;
  fmtBase: (n: number) => string;
}>) {
  const pct = goal.target > 0 ? Math.min((goal.current / goal.target) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-base">{goal.icon}</span>
          <span className="text-sm font-medium text-slate-700">{goal.name}</span>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold text-slate-800">{fmtBase(goal.current)}</span>
          <span className="text-xs text-slate-400"> / {fmtBase(goal.target)}</span>
        </div>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: goal.color }}
        />
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5 text-right">{pct.toFixed(0)}% complete</p>
    </div>
  );
}

function GoalsOverviewCard({
  goals,
  fmtBase,
}: Readonly<{
  goals: readonly GoalDisplay[];
  fmtBase: (n: number) => string;
}>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-slate-900">Financial Goals</h3>
          <p className="text-xs text-slate-400 mt-0.5">Progress update</p>
        </div>
        <Link
          to="/goals"
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>
      {goals.length > 0 ? (
        <div className="space-y-5">
          {goals.map((goal) => (
            <GoalProgressItem key={goal.name} goal={goal} fmtBase={fmtBase} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">
          No goals yet.{' '}
          <Link to="/goals" className="text-indigo-500">
            Create one
          </Link>
        </p>
      )}
    </div>
  );
}

function MonthlySummary({
  items,
}: Readonly<{
  items: readonly MonthlySummaryItem[];
}>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-2xl p-5 border ${item.bg} ${item.border} flex items-center gap-4`}
        >
          <span className="text-3xl">{item.icon}</span>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">{item.label}</p>
            <p className={`font-bold ${item.text}`}>{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Data derivation helpers ──────────────────────────────────────────────────

type GoalSummaryItem = {
  type?: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  monthlyTarget?: number;
  monthsCompleted?: number;
  totalMonths?: number;
  color: string;
  emoji: string;
};

const deriveGoalDisplay = (g: GoalSummaryItem, monthlySalaryValue: number): GoalDisplay => {
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

const buildDashboardCards = (
  allocationByName: Record<string, number>,
  monthlySalaryValue: number,
  monthlySalaryChange: number,
  monthlyCategoryChange: (category: string) => number,
) =>
  [
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
  ] as const;

// ─── Dashboard data hook ──────────────────────────────────────────────────────

type DashboardTx = DashboardTransaction;

const getMonthKeys = (d: Date) => {
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return { currentKey: fmt(d), prevKey: fmt(new Date(d.getFullYear(), d.getMonth() - 1, 1)) };
};

const computeSalary = (txns: readonly DashboardTx[], monthKey: string, prevKey: string) => {
  const monthlySalary = txns.filter((t) => t.category === 'Salary' && t.date.startsWith(monthKey));
  const thisMonth = monthlySalary.reduce((s, t) => s + Math.abs(t.amount), 0);
  const lastMonth = txns
    .filter((t) => t.category === 'Salary' && t.date.startsWith(prevKey))
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const latest = txns.find((t) => t.category === 'Salary');
  const value = thisMonth > 0 ? thisMonth : latest ? Math.abs(latest.amount) : 0;
  return { monthlySalaryValue: value, monthlySalaryChange: lastMonth > 0 ? value - lastMonth : 0 };
};

const computeNWMetrics = (chartData: readonly { value: number }[], totalAlloc: number) => {
  const currentNW = chartData.length > 0 ? chartData[chartData.length - 1].value : totalAlloc;
  const prevNW = chartData.length > 1 ? chartData[chartData.length - 2].value : currentNW;
  const firstNW = chartData.length > 0 ? chartData[0].value : currentNW;
  return {
    netWorth: currentNW,
    monthChange: currentNW - prevNW,
    ytdPct: firstNW > 0 ? ((currentNW - firstNW) / firstNW) * 100 : 0,
  };
};

const buildMonthlySummaryItems = (
  income: number,
  expenses: number,
  fmtBase: (n: number, u?: undefined, c?: boolean) => string,
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

function useDashboardData(fmtBase: (n: number, u?: undefined, c?: boolean) => string) {
  const { data: netWorthData = [], isLoading: loadingNW } = useNetWorthSnapshots();
  const { data: allocations = [], isLoading: loadingAlloc } = useAssetAllocations();
  const { data: recentTransactions = [], isLoading: loadingTxns } = useDashboardTransactions();
  const { data: goals = [], isLoading: loadingGoals } = useGoalsSummary();

  const isLoading = loadingNW || loadingAlloc || loadingTxns || loadingGoals;
  const chartData = netWorthData.map((s) => ({ month: s.month, value: s.totalValue }));
  const allocationData = allocations.map((a) => ({ name: a.name, value: a.value, color: a.color }));
  const totalAlloc = allocationData.reduce((s, d) => s + d.value, 0);
  const allocationByName = allocationData.reduce<Record<string, number>>((acc, item) => {
    acc[item.name] = item.value;
    return acc;
  }, {});

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
  const { netWorth, monthChange, ytdPct } = computeNWMetrics(chartData, totalAlloc);

  const totalIncome = recentTransactions
    .filter((tx) => tx.type === 'income')
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const totalExpenses = recentTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

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
    displayedGoals: goals.map((g) => deriveGoalDisplay(g, monthlySalaryValue)).slice(0, 4),
    displayedRecentTransactions: [...recentTransactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6),
    monthlySummaryItems: buildMonthlySummaryItems(totalIncome, totalExpenses, fmtBase),
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { fmtBase, baseCurrency } = useCurrency();
  const { user } = useAuth();
  const {
    isLoading,
    chartData,
    allocationData,
    totalAlloc,
    recentTransactions,
    monthlySalaryValue,
    monthlyCategoryChange,
    monthlySalaryChange,
    allocationByName,
    netWorth,
    monthChange,
    ytdPct,
    displayedGoals,
    displayedRecentTransactions,
    monthlySummaryItems,
  } = useDashboardData(fmtBase);

  const hour = new Date().getHours();
  const greeting = getGreeting(hour);
  const greetingName = user?.name ?? 'there';

  const dashboardCards = buildDashboardCards(
    allocationByName,
    monthlySalaryValue,
    monthlySalaryChange,
    monthlyCategoryChange,
  );

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-6">
      <WelcomeBanner
        greeting={greeting}
        greetingName={greetingName}
        netWorth={netWorth}
        monthChange={monthChange}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {dashboardCards.map((card) => {
          const Icon = card.icon;
          return (
            <StatCard
              key={card.label}
              label={card.label}
              value={fmtBase(card.value)}
              icon={Icon}
              color={card.color}
              href={card.path}
              change={{
                value: `${card.monthlyChange >= 0 ? '+' : '-'}${fmtBase(Math.abs(card.monthlyChange), undefined, true)} this month`,
                positive: card.monthlyChange >= 0,
              }}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AreaChartCard
            title="Net Worth Growth"
            subtitle={`Last ${chartData.length} months in ${baseCurrency}`}
            data={chartData}
            dataKey="value"
            xKey="month"
            color="#6366f1"
            height={220}
            formatValue={fmtBase}
            badge={
              ytdPct !== 0 ? (
                <span
                  className={`text-xs px-3 py-1 rounded-full font-medium ${ytdPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                >
                  {ytdPct >= 0 ? '+' : ''}
                  {ytdPct.toFixed(1)}%
                </span>
              ) : undefined
            }
            emptyMessage="No net worth data yet."
          />
        </div>
        <AssetAllocationCard
          allocationData={allocationData}
          totalAlloc={totalAlloc}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTransactionsCard
          transactions={displayedRecentTransactions}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
        />
        <GoalsOverviewCard goals={displayedGoals} fmtBase={fmtBase} />
      </div>
      {recentTransactions.length > 0 && <MonthlySummary items={monthlySummaryItems} />}
    </div>
  );
}
