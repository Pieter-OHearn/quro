import { Link } from "react-router";
import {
  PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, PiggyBank, Briefcase,
  ArrowRight, CreditCard, ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { AreaChartCard, LoadingSpinner, StatCard } from "@/components/ui";
import { useCurrency } from "@/lib/CurrencyContext";
import { useAuth } from "@/lib/AuthContext";
import {
  useNetWorthSnapshots,
  useAssetAllocations,
  useDashboardTransactions,
  useGoalsSummary,
} from "./hooks";

export function Dashboard() {
  const { fmtBase, baseCurrency } = useCurrency();
  const { user } = useAuth();

  const { data: netWorthData = [], isLoading: loadingNW } = useNetWorthSnapshots();
  const { data: allocations = [], isLoading: loadingAlloc } = useAssetAllocations();
  const { data: recentTransactions = [], isLoading: loadingTxns } = useDashboardTransactions();
  const { data: goals = [], isLoading: loadingGoals } = useGoalsSummary();

  const isLoading = loadingNW || loadingAlloc || loadingTxns || loadingGoals;

  // Derive net worth chart data
  const chartData = netWorthData.map((s) => ({
    month: s.month,
    value: s.totalValue,
  }));

  // Derive allocation pie data
  const allocationData = allocations.map((a) => ({
    name: a.name,
    value: a.value,
    color: a.color,
  }));

  const totalAlloc = allocationData.reduce((s, d) => s + d.value, 0);

  const allocationByName = allocationData.reduce<Record<string, number>>((acc, item) => {
    acc[item.name] = item.value;
    return acc;
  }, {});

  const currentDate = new Date();
  const currentMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  const previousMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const monthTransactions = recentTransactions.filter((tx) => tx.date.startsWith(currentMonthKey));

  const monthlyCategoryChange = (category: string) =>
    monthTransactions
      .filter((tx) => tx.category === category)
      .reduce((sum, tx) => sum + (tx.type === "transfer" ? -tx.amount : tx.amount), 0);

  const salaryThisMonth = monthTransactions
    .filter((tx) => tx.category === "Salary")
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const salaryLastMonth = recentTransactions
    .filter((tx) => tx.category === "Salary" && tx.date.startsWith(previousMonthKey))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const latestSalary = recentTransactions.find((tx) => tx.category === "Salary");
  const monthlySalaryValue = salaryThisMonth > 0 ? salaryThisMonth : latestSalary ? Math.abs(latestSalary.amount) : 0;
  const monthlySalaryChange = salaryLastMonth > 0 ? monthlySalaryValue - salaryLastMonth : 0;

  const dashboardCards = [
    {
      label: "Total Savings",
      value: allocationByName.Savings ?? 0,
      monthlyChange: monthlyCategoryChange("Savings"),
      icon: PiggyBank,
      path: "/savings",
      color: "indigo",
    },
    {
      label: "Investments",
      value: allocationByName.Brokerage ?? 0,
      monthlyChange: monthlyCategoryChange("Investment"),
      icon: TrendingUp,
      path: "/investments",
      color: "sky",
    },
    {
      label: "Pension",
      value: allocationByName.Pension ?? 0,
      monthlyChange: monthlyCategoryChange("Pension"),
      icon: ShieldCheck,
      path: "/pension",
      color: "amber",
    },
    {
      label: "Monthly Salary",
      value: monthlySalaryValue,
      monthlyChange: monthlySalaryChange,
      icon: Briefcase,
      path: "/salary",
      color: "emerald",
    },
  ] as const;

  // Net worth and monthly trend
  const currentNW = chartData.length > 0 ? chartData[chartData.length - 1].value : totalAlloc;
  const prevNW = chartData.length > 1 ? chartData[chartData.length - 2].value : currentNW;
  const netWorth = currentNW;
  const monthChange = currentNW - prevNW;

  // YTD percentage
  const firstNW = chartData.length > 0 ? chartData[0].value : currentNW;
  const ytdPct = firstNW > 0 ? ((currentNW - firstNW) / firstNW) * 100 : 0;

  // Goals data for dashboard
  const goalsMock = goals.map((g) => {
    const goalType = g.type ?? "savings";
    const defaultCurrent = g.currentAmount;
    const defaultTarget = g.targetAmount;

    if (goalType === "invest_habit") {
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

    if (goalType === "salary") {
      return {
        name: g.name,
        current: monthlySalaryValue * 12,
        target: defaultTarget,
        color: g.color,
        icon: g.emoji,
      };
    }

    return {
      name: g.name,
      current: defaultCurrent,
      target: defaultTarget,
      color: g.color,
      icon: g.emoji,
    };
  });
  const displayedGoals = goalsMock.slice(0, 4);

  const displayedRecentTransactions = [...recentTransactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  // Monthly summary from transactions
  const totalIncome = recentTransactions
    .filter((tx) => tx.type === "income")
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const totalExpenses = recentTransactions
    .filter((tx) => tx.type === "expense")
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const monthlySavings = totalIncome - totalExpenses;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const greetingName = user?.name ?? "there";

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#0a0f1e] via-[#1a1f3e] to-[#1e1448] p-6 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 right-24 w-40 h-40 bg-purple-500/10 rounded-full translate-y-1/2" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-indigo-300 text-sm mb-1">{greeting}, {greetingName}</p>
            <h2 className="text-2xl font-bold">Your Financial Overview</h2>
            <p className="text-slate-400 text-sm mt-1">Base currency: {baseCurrency}</p>
          </div>
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
                <span className={`text-xs ${monthChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {monthChange >= 0 ? "+" : ""}{fmtBase(monthChange)} this month
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Key stats */}
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
                value: `${card.monthlyChange >= 0 ? "+" : "-"}${fmtBase(Math.abs(card.monthlyChange), undefined, true)} this month`,
                positive: card.monthlyChange >= 0,
              }}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Net Worth Chart */}
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
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${ytdPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {ytdPct >= 0 ? "+" : ""}
                  {ytdPct.toFixed(1)}%
                </span>
              ) : undefined
            }
            emptyMessage="No net worth data yet."
          />
        </div>

        {/* Asset Allocation */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-1">Asset Allocation</h3>
          <p className="text-xs text-slate-400 mb-4">All values in {baseCurrency}</p>
          {allocationData.length > 0 ? (
            <>
              <div className="flex justify-center mb-4">
                <PieChart width={160} height={160}>
                  <Pie data={allocationData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                    {allocationData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </div>
              <div className="space-y-2">
                {allocationData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-slate-600">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-slate-800">{fmtBase(item.value)}</span>
                      <span className="text-[10px] text-slate-400 ml-1">{totalAlloc > 0 ? ((item.value / totalAlloc) * 100).toFixed(0) : 0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400 py-12 text-center">No allocation data yet.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-slate-900">Recent Transactions</h3>
              <p className="text-xs text-slate-400 mt-0.5">This month in {baseCurrency}</p>
            </div>
            <Link to="/budget" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {displayedRecentTransactions.length > 0 ? (
            <div className="space-y-3">
              {displayedRecentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      tx.type === "income"   ? "bg-emerald-50 text-emerald-600" :
                      tx.type === "transfer" ? "bg-indigo-50 text-indigo-600"   :
                      "bg-slate-100 text-slate-500"
                    }`}>
                      <CreditCard size={15} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{tx.name}</p>
                      <p className="text-xs text-slate-400">{tx.category} · {tx.date}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${tx.amount > 0 ? "text-emerald-600" : "text-slate-700"}`}>
                    {tx.amount > 0 ? "+" : ""}{fmtBase(Math.abs(tx.amount), undefined, true)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">No transactions yet.</p>
          )}
        </div>

        {/* Goals overview */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-slate-900">Financial Goals</h3>
              <p className="text-xs text-slate-400 mt-0.5">Progress update</p>
            </div>
            <Link to="/goals" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {displayedGoals.length > 0 ? (
            <div className="space-y-5">
              {displayedGoals.map((goal) => {
                const pct = goal.target > 0 ? Math.min((goal.current / goal.target) * 100, 100) : 0;
                return (
                  <div key={goal.name}>
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
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 text-right">{pct.toFixed(0)}% complete</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">No goals yet. <Link to="/goals" className="text-indigo-500">Create one</Link></p>
          )}
        </div>
      </div>

      {/* Monthly summary */}
      {recentTransactions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Income",    value: fmtBase(totalIncome, undefined, true), icon: "\ud83d\udcb0", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100" },
            { label: "Total Expenses",  value: fmtBase(totalExpenses, undefined, true), icon: "\ud83d\udce4", bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-100"    },
            { label: "Monthly Savings", value: fmtBase(monthlySavings, undefined, true), icon: "\ud83c\udfe6", bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-100"  },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl p-5 border ${item.bg} ${item.border} flex items-center gap-4`}>
              <span className="text-3xl">{item.icon}</span>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">{item.label}</p>
                <p className={`font-bold ${item.text}`}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
