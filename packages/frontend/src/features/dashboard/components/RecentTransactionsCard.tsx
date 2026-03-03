import { ArrowRight, CreditCard } from 'lucide-react';
import { Link } from 'react-router';
import type { DashboardFormatFn, DashboardTransaction } from '../types';

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
  fmtBase: DashboardFormatFn;
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

export function RecentTransactionsCard({
  transactions,
  baseCurrency,
  fmtBase,
}: Readonly<{
  transactions: readonly DashboardTransaction[];
  baseCurrency: string;
  fmtBase: DashboardFormatFn;
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
