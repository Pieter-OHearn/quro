import { ArrowRight, CreditCard } from 'lucide-react';
import { Link } from 'react-router';
import { JointBadge } from '@/features/partner';
import type { DashboardFormatFn, DashboardTransaction } from '../types';

const txIconClass = (type: string) => {
  if (type === 'income') return 'bg-success-soft text-success';
  if (type === 'transfer') return 'bg-brand-soft text-brand';
  return 'bg-surface-muted text-fg-subtle';
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
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-fg-emphasis">{tx.name}</p>
            <JointBadge isJoint={tx.isJoint} size="xs" />
          </div>
          <p className="text-xs text-fg-faint">
            {tx.category} · {tx.date}
          </p>
        </div>
      </div>
      <span
        className={`text-sm font-semibold ${tx.amount > 0 ? 'text-success' : 'text-fg-strong'}`}
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
    <div className="bg-surface rounded-2xl p-6 border border-border-subtle shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-fg">Recent Transactions</h3>
          <p className="text-xs text-fg-faint mt-0.5">This month in {baseCurrency}</p>
        </div>
        <Link
          to="/budget"
          className="text-xs text-brand hover:text-brand-fg font-medium flex items-center gap-1"
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
        <p className="text-sm text-fg-faint py-8 text-center">No transactions yet.</p>
      )}
    </div>
  );
}
