import { ArrowUpRight, Percent, PiggyBank, TrendingUp } from 'lucide-react';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import type { SavingsFormatFn } from '../types';

type SavingsStatsProps = {
  totalInBase: number;
  totalInterest: number;
  avgRate: number;
  accounts: SavingsAccount[];
  transactions: SavingsTransaction[];
  fmtBase: SavingsFormatFn;
};

type TotalSavingsCardProps = Pick<
  SavingsStatsProps,
  'totalInBase' | 'accounts' | 'transactions' | 'fmtBase'
>;

function TotalSavingsCard({
  totalInBase,
  accounts,
  transactions,
  fmtBase,
}: Readonly<TotalSavingsCardProps>) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <PiggyBank size={18} />
        </div>
        <p className="text-sm text-slate-500">Total Savings</p>
      </div>
      <p className="text-2xl font-bold text-slate-900">{fmtBase(totalInBase)}</p>
      <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600">
        <ArrowUpRight size={12} />
        <span>across {accounts.length} accounts</span>
      </div>
      <p className="text-xs text-slate-400 mt-0.5">
        {new Set(accounts.map((account) => account.currency)).size} currencies ·{' '}
        {transactions.length} transactions
      </p>
    </div>
  );
}

export function SavingsStats({
  totalInBase,
  totalInterest,
  avgRate,
  accounts,
  transactions,
  fmtBase,
}: Readonly<SavingsStatsProps>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <TotalSavingsCard
        totalInBase={totalInBase}
        accounts={accounts}
        transactions={transactions}
        fmtBase={fmtBase}
      />
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Percent size={18} />
          </div>
          <p className="text-sm text-slate-500">Avg. Interest Rate</p>
        </div>
        <p className="text-2xl font-bold text-slate-900">{avgRate.toFixed(2)}%</p>
        <p className="text-xs text-slate-400 mt-1">Weighted average APY</p>
      </div>
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <TrendingUp size={18} />
          </div>
          <p className="text-sm text-slate-500">Monthly Interest</p>
        </div>
        <p className="text-2xl font-bold text-slate-900">
          {fmtBase(totalInterest, undefined, true)}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {`\u2248 ${fmtBase(totalInterest * 12)} per year`}
        </p>
      </div>
    </div>
  );
}
