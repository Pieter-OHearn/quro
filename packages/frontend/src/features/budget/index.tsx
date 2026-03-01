import { useState } from 'react';
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
} from 'recharts';
import {
  Wallet,
  Plus,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Loader2,
} from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import { useBudgetCategories, useBudgetTransactions, useCreateBudgetCategory } from './hooks';

type BudgetCategory = {
  id: number;
  name: string;
  budgeted: number;
  spent: number;
  color: string;
  emoji: string;
};
type BudgetTx = {
  id: number;
  merchant?: string;
  description: string;
  amount: number;
  date: string;
  categoryId: number;
};

type FmtFn = (n: number) => string;

type SummaryCardsProps = {
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  savingsRate: number;
  fmt: FmtFn;
};

function TotalBudgetCard({ totalBudgeted, fmt }: Readonly<{ totalBudgeted: number; fmt: FmtFn }>) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
        <Wallet size={18} />
      </div>
      <p className="text-xs text-slate-500 mb-1">Total Budget</p>
      <p className="font-bold text-slate-900">{fmt(totalBudgeted)}</p>
      <p className="text-xs text-slate-400 mt-1">This month</p>
    </div>
  );
}

function TotalSpentCard({
  totalBudgeted,
  totalSpent,
  fmt,
}: Readonly<{ totalBudgeted: number; totalSpent: number; fmt: FmtFn }>) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
        <TrendingDown size={18} />
      </div>
      <p className="text-xs text-slate-500 mb-1">Total Spent</p>
      <p className="font-bold text-slate-900">{fmt(totalSpent)}</p>
      <p className="text-xs text-slate-400 mt-1">
        {totalBudgeted > 0 ? ((totalSpent / totalBudgeted) * 100).toFixed(0) : 0}% of budget
      </p>
    </div>
  );
}

function RemainingCard({ remaining, fmt }: Readonly<{ remaining: number; fmt: FmtFn }>) {
  const isPositive = remaining >= 0;
  return (
    <div
      className={`bg-white rounded-2xl p-5 border shadow-sm ${isPositive ? 'border-slate-100' : 'border-rose-200'}`}
    >
      <div
        className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}
      >
        {isPositive ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      </div>
      <p className="text-xs text-slate-500 mb-1">Remaining</p>
      <p className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`}>
        {isPositive ? '+' : ''}
        {fmt(remaining)}
      </p>
      <p className="text-xs text-slate-400 mt-1">{isPositive ? 'Under budget' : 'Over budget'}</p>
    </div>
  );
}

function SavingsRateCard({ savingsRate }: Readonly<{ savingsRate: number }>) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
        <CheckCircle2 size={18} />
      </div>
      <p className="text-xs text-slate-500 mb-1">Savings Rate</p>
      <p className="font-bold text-sky-600">{savingsRate.toFixed(1)}%</p>
      <p className="text-xs text-slate-400 mt-1">of monthly budget</p>
    </div>
  );
}

function BudgetSummaryCards({
  totalBudgeted,
  totalSpent,
  remaining,
  savingsRate,
  fmt,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <TotalBudgetCard totalBudgeted={totalBudgeted} fmt={fmt} />
      <TotalSpentCard totalBudgeted={totalBudgeted} totalSpent={totalSpent} fmt={fmt} />
      <RemainingCard remaining={remaining} fmt={fmt} />
      <SavingsRateCard savingsRate={savingsRate} />
    </div>
  );
}

type PieEntry = { name: string; value: number; color: string };

function SpendingPieChart({ pieData, fmtDec }: { pieData: PieEntry[]; fmtDec: FmtFn }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Spending Breakdown</h3>
      <p className="text-xs text-slate-400 mb-4">Current month</p>
      {pieData.length > 0 ? (
        <>
          <div className="flex justify-center">
            <PieChart width={180} height={180}>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={50}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => fmtDec(v)}
                contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
              />
            </PieChart>
          </div>
          <div className="space-y-1.5 mt-2">
            {pieData.slice(0, 5).map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
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
  );
}

function BudgetVsSpentChart({ categories, fmt }: { categories: BudgetCategory[]; fmt: FmtFn }) {
  return (
    <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Budget vs Spent</h3>
      <p className="text-xs text-slate-400 mb-5">Category breakdown</p>
      {categories.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={categories.map((c) => ({ name: c.name, budgeted: c.budgeted, spent: c.spent }))}
            barSize={14}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              angle={-30}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmt(v)}
            />
            <Tooltip
              formatter={(v: number, name: string) => [
                fmt(v),
                name === 'budgeted' ? 'Budgeted' : 'Spent',
              ]}
              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
            />
            <Bar dataKey="budgeted" name="budgeted" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="spent" name="spent" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-slate-400 py-12 text-center">No budget categories yet.</p>
      )}
    </div>
  );
}

type AddCategoryFormProps = {
  newCat: { name: string; budgeted: string };
  baseCurrency: string;
  onChange: (v: { name: string; budgeted: string }) => void;
  onAdd: () => void;
};

function AddCategoryForm({ newCat, baseCurrency, onChange, onAdd }: AddCategoryFormProps) {
  return (
    <div className="mb-5 p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex gap-3">
      <input
        className="flex-1 rounded-xl border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        placeholder="Category name"
        value={newCat.name}
        onChange={(e) => onChange({ ...newCat, name: e.target.value })}
      />
      <input
        className="w-36 rounded-xl border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        placeholder={`Budget (${baseCurrency})`}
        type="number"
        value={newCat.budgeted}
        onChange={(e) => onChange({ ...newCat, budgeted: e.target.value })}
      />
      <button
        onClick={onAdd}
        className="rounded-xl bg-indigo-600 text-white text-sm px-4 py-2 hover:bg-indigo-700 transition-colors"
      >
        Add
      </button>
    </div>
  );
}

function CategoryRow({ cat, fmt, fmtDec }: { cat: BudgetCategory; fmt: FmtFn; fmtDec: FmtFn }) {
  const pct = cat.budgeted > 0 ? Math.min((cat.spent / cat.budgeted) * 100, 100) : 0;
  const over = cat.spent > cat.budgeted;
  const surplus = cat.budgeted - cat.spent;
  return (
    <div
      className={`p-3 rounded-xl transition-colors ${over ? 'bg-rose-50 border border-rose-100' : 'hover:bg-slate-50'}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl w-8 text-center">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-slate-800">{cat.name}</p>
            <div className="flex items-center gap-3 text-xs">
              <span className={over ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
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
                backgroundColor: over ? '#f43f5e' : cat.color,
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
}

type BudgetCategoriesSectionProps = {
  categories: BudgetCategory[];
  overBudget: BudgetCategory[];
  showAdd: boolean;
  newCat: { name: string; budgeted: string };
  baseCurrency: string;
  fmt: FmtFn;
  fmtDec: FmtFn;
  onToggleAdd: () => void;
  onNewCatChange: (v: { name: string; budgeted: string }) => void;
  onAddCategory: () => void;
};

function CategorySectionHeader({
  overBudget,
  onToggleAdd,
}: Readonly<{ overBudget: BudgetCategory[]; onToggleAdd: () => void }>) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h3 className="font-semibold text-slate-900">Budget Categories</h3>
        {overBudget.length > 0 && (
          <p className="text-xs text-rose-500 mt-0.5">{overBudget.length} categories over budget</p>
        )}
      </div>
      <button
        onClick={onToggleAdd}
        className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
      >
        <Plus size={15} /> Add Category
      </button>
    </div>
  );
}

function CategoryList({
  categories,
  fmt,
  fmtDec,
}: Readonly<{ categories: BudgetCategory[]; fmt: FmtFn; fmtDec: FmtFn }>) {
  return (
    <div className="space-y-2">
      {categories.map((cat) => (
        <CategoryRow key={cat.id} cat={cat} fmt={fmt} fmtDec={fmtDec} />
      ))}
      {categories.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">
          No budget categories yet. Click <strong>Add Category</strong> to get started.
        </p>
      )}
    </div>
  );
}

function BudgetCategoriesSection({
  categories,
  overBudget,
  showAdd,
  newCat,
  baseCurrency,
  fmt,
  fmtDec,
  onToggleAdd,
  onNewCatChange,
  onAddCategory,
}: BudgetCategoriesSectionProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <CategorySectionHeader overBudget={overBudget} onToggleAdd={onToggleAdd} />
      {showAdd && (
        <AddCategoryForm
          newCat={newCat}
          baseCurrency={baseCurrency}
          onChange={onNewCatChange}
          onAdd={onAddCategory}
        />
      )}
      <CategoryList categories={categories} fmt={fmt} fmtDec={fmtDec} />
    </div>
  );
}

type RecentTx = {
  id: number;
  name: string;
  category: string;
  amount: number;
  date: string;
  emoji: string;
  color?: string;
};

function RecentTransactionsList({
  transactions,
  fmtDec,
}: {
  transactions: RecentTx[];
  fmtDec: FmtFn;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-5">Recent Transactions</h3>
      {transactions.length > 0 ? (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
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
  );
}

function deriveBudgetStats(categories: BudgetCategory[]) {
  const totalBudgeted = categories.reduce((s, c) => s + c.budgeted, 0);
  const totalSpent = categories.reduce((s, c) => s + c.spent, 0);
  const remaining = totalBudgeted - totalSpent;
  const monthIncome = totalBudgeted > 0 ? totalBudgeted : 1;
  const savingsRate = ((monthIncome - totalSpent) / monthIncome) * 100;
  const overBudget = categories.filter((c) => c.spent > c.budgeted);
  const pieData = categories
    .filter((c) => c.spent > 0)
    .map((c) => ({ name: c.name, value: c.spent, color: c.color }));
  return { totalBudgeted, totalSpent, remaining, savingsRate, overBudget, pieData };
}

function mapRecentTransactions(
  budgetTransactions: BudgetTx[],
  categories: BudgetCategory[],
): RecentTx[] {
  return budgetTransactions.slice(0, 10).map((tx) => {
    const cat = categories.find((c) => c.id === tx.categoryId);
    return {
      id: tx.id,
      name: tx.merchant || tx.description,
      category: cat?.name ?? '',
      amount: tx.amount,
      date: tx.date,
      emoji: cat?.emoji ?? '\ud83d\udce6',
      color: cat?.color,
    };
  });
}

type BudgetChartsRowProps = {
  pieData: PieEntry[];
  categories: BudgetCategory[];
  fmtDec: FmtFn;
  fmt: FmtFn;
};

function BudgetChartsRow({ pieData, categories, fmtDec, fmt }: BudgetChartsRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <SpendingPieChart pieData={pieData} fmtDec={fmtDec} />
      <BudgetVsSpentChart categories={categories} fmt={fmt} />
    </div>
  );
}

type BudgetBodyProps = {
  categories: BudgetCategory[];
  budgetTransactions: BudgetTx[];
  showAdd: boolean;
  newCat: { name: string; budgeted: string };
  baseCurrency: string;
  fmt: FmtFn;
  fmtDec: FmtFn;
  onToggleAdd: () => void;
  onNewCatChange: (v: { name: string; budgeted: string }) => void;
  onAddCategory: () => void;
};

function BudgetBody({
  categories, budgetTransactions, showAdd, newCat, baseCurrency,
  fmt, fmtDec, onToggleAdd, onNewCatChange, onAddCategory,
}: BudgetBodyProps) {
  const { totalBudgeted, totalSpent, remaining, savingsRate, overBudget, pieData } = deriveBudgetStats(categories);
  const recentTransactions = mapRecentTransactions(budgetTransactions, categories);
  return (
    <div className="p-6 space-y-6">
      <BudgetSummaryCards totalBudgeted={totalBudgeted} totalSpent={totalSpent} remaining={remaining} savingsRate={savingsRate} fmt={fmt} />
      <BudgetChartsRow pieData={pieData} categories={categories} fmtDec={fmtDec} fmt={fmt} />
      <BudgetCategoriesSection
        categories={categories} overBudget={overBudget} showAdd={showAdd} newCat={newCat}
        baseCurrency={baseCurrency} fmt={fmt} fmtDec={fmtDec}
        onToggleAdd={onToggleAdd} onNewCatChange={onNewCatChange} onAddCategory={onAddCategory}
      />
      <RecentTransactionsList transactions={recentTransactions} fmtDec={fmtDec} />
    </div>
  );
}

function useBudgetPage() {
  const { fmtBase, baseCurrency } = useCurrency();
  const fmtDec = (n: number) => fmtBase(n, undefined, true);
  const fmt = (n: number) => fmtBase(n);
  const { data: categories = [], isLoading: loadingCats } = useBudgetCategories();
  const { data: budgetTransactions = [], isLoading: loadingTxns } = useBudgetTransactions();
  const createCategory = useCreateBudgetCategory();
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', budgeted: '' });

  function handleAddCategory() {
    if (!newCat.name || !newCat.budgeted) return;
    createCategory.mutate({
      name: newCat.name,
      emoji: '\ud83d\udce6',
      budgeted: parseFloat(newCat.budgeted),
      spent: 0,
      color: '#94a3b8',
      month: new Date().toLocaleString('en-US', { month: 'short' }),
      year: new Date().getFullYear(),
    });
    setNewCat({ name: '', budgeted: '' });
    setShowAdd(false);
  }

  return {
    fmtDec,
    fmt,
    baseCurrency,
    categories,
    budgetTransactions,
    loadingCats,
    loadingTxns,
    showAdd,
    newCat,
    setShowAdd,
    setNewCat,
    handleAddCategory,
  };
}

export function Budget() {
  const {
    fmtDec, fmt, baseCurrency, categories, budgetTransactions,
    loadingCats, loadingTxns, showAdd, newCat, setShowAdd, setNewCat, handleAddCategory,
  } = useBudgetPage();

  if (loadingCats || loadingTxns) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <BudgetBody
      categories={categories}
      budgetTransactions={budgetTransactions}
      showAdd={showAdd}
      newCat={newCat}
      baseCurrency={baseCurrency}
      fmt={fmt}
      fmtDec={fmtDec}
      onToggleAdd={() => setShowAdd(!showAdd)}
      onNewCatChange={setNewCat}
      onAddCategory={handleAddCategory}
    />
  );
}
