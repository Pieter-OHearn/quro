import type { BudgetFormatFn, RecentBudgetTx } from '../types';

type RecentTransactionsListProps = {
  transactions: RecentBudgetTx[];
  fmtDec: BudgetFormatFn;
};

export function RecentTransactionsList({
  transactions,
  fmtDec,
}: Readonly<RecentTransactionsListProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-5">Recent Transactions</h3>
      {transactions.length > 0 ? (
        <div className="space-y-2">
          {transactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <span className="text-xl w-8 text-center">{transaction.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{transaction.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{transaction.date}</span>
                  {transaction.category && transaction.color && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: transaction.color }}
                    >
                      {transaction.category}
                    </span>
                  )}
                </div>
              </div>
              <p className="font-semibold text-slate-800">-{fmtDec(transaction.amount)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">No transactions yet.</p>
      )}
    </div>
  );
}
