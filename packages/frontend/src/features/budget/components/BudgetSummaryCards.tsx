import { AlertTriangle, CheckCircle2, TrendingDown, Wallet } from 'lucide-react';
import type { BudgetFormatFn } from '../types';

type BudgetSummaryCardsProps = {
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  savingsRate: number;
  fmt: BudgetFormatFn;
};

function TotalBudgetCard({
  totalBudgeted,
  fmt,
}: Readonly<{ totalBudgeted: number; fmt: BudgetFormatFn }>) {
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
}: Readonly<{ totalBudgeted: number; totalSpent: number; fmt: BudgetFormatFn }>) {
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

function RemainingCard({ remaining, fmt }: Readonly<{ remaining: number; fmt: BudgetFormatFn }>) {
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

export function BudgetSummaryCards({
  totalBudgeted,
  totalSpent,
  remaining,
  savingsRate,
  fmt,
}: Readonly<BudgetSummaryCardsProps>) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <TotalBudgetCard totalBudgeted={totalBudgeted} fmt={fmt} />
      <TotalSpentCard totalBudgeted={totalBudgeted} totalSpent={totalSpent} fmt={fmt} />
      <RemainingCard remaining={remaining} fmt={fmt} />
      <SavingsRateCard savingsRate={savingsRate} />
    </div>
  );
}
