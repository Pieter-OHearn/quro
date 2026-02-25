import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Wallet, Plus, TrendingDown, CheckCircle2, AlertTriangle, Edit3, Loader2 } from "lucide-react";
import { useCurrency } from "@/lib/CurrencyContext";
import {
  useBudgetCategories,
  useBudgetTransactions,
  useCreateBudgetCategory,
} from "./hooks";

export function Budget() {
  const { fmtBase, baseCurrency } = useCurrency();
  const fmtDec = (n: number) => fmtBase(n, undefined, true);
  const fmt    = (n: number) => fmtBase(n);

  const { data: categories = [], isLoading: loadingCats } = useBudgetCategories();
  const { data: budgetTransactions = [], isLoading: loadingTxns } = useBudgetTransactions();
  const createCategory = useCreateBudgetCategory();

  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", budgeted: "" });

  const totalBudgeted = categories.reduce((s, c) => s + c.budgeted, 0);
  const totalSpent = categories.reduce((s, c) => s + c.spent, 0);
  const remaining = totalBudgeted - totalSpent;

  const monthIncome = totalBudgeted > 0 ? totalBudgeted : 1;
  const savingsRate = ((monthIncome - totalSpent) / monthIncome) * 100;

  const overBudget = categories.filter((c) => c.spent > c.budgeted);

  const pieData = categories.filter((c) => c.spent > 0).map((c) => ({ name: c.name, value: c.spent, color: c.color }));

  const recentTransactions = budgetTransactions.slice(0, 10).map((tx) => {
    const cat = categories.find((c) => c.id === tx.categoryId);
    return {
      id: tx.id,
      name: tx.merchant || tx.description,
      category: cat?.name ?? "",
      amount: tx.amount,
      date: tx.date,
      emoji: cat?.emoji ?? "\ud83d\udce6",
      color: cat?.color,
    };
  });

  const isLoading = loadingCats || loadingTxns;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <Wallet size={18} />
          </div>
          <p className="text-xs text-slate-500 mb-1">Total Budget</p>
          <p className="font-bold text-slate-900">{fmt(totalBudgeted)}</p>
          <p className="text-xs text-slate-400 mt-1">This month</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
            <TrendingDown size={18} />
          </div>
          <p className="text-xs text-slate-500 mb-1">Total Spent</p>
          <p className="font-bold text-slate-900">{fmt(totalSpent)}</p>
          <p className="text-xs text-slate-400 mt-1">{totalBudgeted > 0 ? ((totalSpent / totalBudgeted) * 100).toFixed(0) : 0}% of budget</p>
        </div>
        <div className={`bg-white rounded-2xl p-5 border shadow-sm ${remaining >= 0 ? "border-slate-100" : "border-rose-200"}`}>
          <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${remaining >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
            {remaining >= 0 ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          </div>
          <p className="text-xs text-slate-500 mb-1">Remaining</p>
          <p className={`font-bold ${remaining >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
            {remaining >= 0 ? "+" : ""}{fmt(remaining)}
          </p>
          <p className="text-xs text-slate-400 mt-1">{remaining >= 0 ? "Under budget" : "Over budget"}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
            <CheckCircle2 size={18} />
          </div>
          <p className="text-xs text-slate-500 mb-1">Savings Rate</p>
          <p className="font-bold text-sky-600">{savingsRate.toFixed(1)}%</p>
          <p className="text-xs text-slate-400 mt-1">of monthly budget</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spending Pie */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-1">Spending Breakdown</h3>
          <p className="text-xs text-slate-400 mb-4">Current month</p>
          {pieData.length > 0 ? (
            <>
              <div className="flex justify-center">
                <PieChart width={180} height={180}>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} innerRadius={50} paddingAngle={2} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtDec(v)} contentStyle={{ borderRadius: "12px", fontSize: "12px" }} />
                </PieChart>
              </div>
              <div className="space-y-1.5 mt-2">
                {pieData.slice(0, 5).map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-slate-600">{item.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800">{fmtDec(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400 py-12 text-center">No spending data yet.</p>
          )}
        </div>

        {/* Budget vs Spent chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-1">Budget vs Spent</h3>
          <p className="text-xs text-slate-400 mb-5">Category breakdown</p>
          {categories.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categories.map((c) => ({ name: c.name, budgeted: c.budgeted, spent: c.spent }))} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                <Tooltip formatter={(v: number, name: string) => [fmt(v), name === "budgeted" ? "Budgeted" : "Spent"]} contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }} />
                <Bar dataKey="budgeted" name="budgeted" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" name="spent" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 py-12 text-center">No budget categories yet.</p>
          )}
        </div>
      </div>

      {/* Category budget table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-slate-900">Budget Categories</h3>
            {overBudget.length > 0 && (
              <p className="text-xs text-rose-500 mt-0.5">{overBudget.length} categories over budget</p>
            )}
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} /> Add Category
          </button>
        </div>

        {showAdd && (
          <div className="mb-5 p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex gap-3">
            <input
              className="flex-1 rounded-xl border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Category name"
              value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
            />
            <input
              className="w-36 rounded-xl border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder={`Budget (${baseCurrency})`}
              type="number"
              value={newCat.budgeted}
              onChange={(e) => setNewCat({ ...newCat, budgeted: e.target.value })}
            />
            <button
              onClick={() => {
                if (!newCat.name || !newCat.budgeted) return;
                createCategory.mutate({
                  name: newCat.name,
                  emoji: "\ud83d\udce6",
                  budgeted: parseFloat(newCat.budgeted),
                  spent: 0,
                  color: "#94a3b8",
                  month: new Date().toLocaleString("en-US", { month: "short" }),
                  year: new Date().getFullYear(),
                });
                setNewCat({ name: "", budgeted: "" });
                setShowAdd(false);
              }}
              className="rounded-xl bg-indigo-600 text-white text-sm px-4 py-2 hover:bg-indigo-700 transition-colors"
            >
              Add
            </button>
          </div>
        )}

        <div className="space-y-2">
          {categories.map((cat) => {
            const pct = cat.budgeted > 0 ? Math.min((cat.spent / cat.budgeted) * 100, 100) : 0;
            const over = cat.spent > cat.budgeted;
            const surplus = cat.budgeted - cat.spent;
            return (
              <div key={cat.id} className={`p-3 rounded-xl transition-colors ${over ? "bg-rose-50 border border-rose-100" : "hover:bg-slate-50"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl w-8 text-center">{cat.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-slate-800">{cat.name}</p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className={over ? "text-rose-600 font-semibold" : "text-slate-500"}>
                          {fmtDec(cat.spent)} / {fmt(cat.budgeted)}
                        </span>
                        {over ? (
                          <span className="text-rose-500 font-semibold">-{fmt(Math.abs(surplus))}</span>
                        ) : (
                          <span className="text-emerald-600">+{fmt(surplus)} left</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${over ? 100 : pct}%`,
                          backgroundColor: over ? "#f43f5e" : cat.color,
                        }}
                      />
                    </div>
                  </div>
                  <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
                    <Edit3 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
          {categories.length === 0 && (
            <p className="text-sm text-slate-400 py-8 text-center">No budget categories yet. Click <strong>Add Category</strong> to get started.</p>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <h3 className="font-semibold text-slate-900 mb-5">Recent Transactions</h3>
        {recentTransactions.length > 0 ? (
          <div className="space-y-2">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <span className="text-xl w-8 text-center">{tx.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{tx.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{tx.date}</span>
                    {tx.category && tx.color && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: tx.color }}
                      >
                        {tx.category}
                      </span>
                    )}
                  </div>
                </div>
                <p className="font-semibold text-slate-800">-{fmtDec(tx.amount)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-8 text-center">No transactions yet.</p>
        )}
      </div>
    </div>
  );
}
