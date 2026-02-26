import { useState } from 'react';
import { Filter, Plus, Trash2 } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';
import { TXN_META, type MortgageTxnType } from './txnMeta';

type MortgageTxnHistoryProps = {
  mortgage: MortgageType;
  transactions: MortgageTransaction[];
  onAdd: () => void;
  onDelete: (id: number) => void;
};

export function MortgageTxnHistory({
  mortgage: _mortgage,
  transactions,
  onAdd,
  onDelete,
}: MortgageTxnHistoryProps) {
  const { fmtBase } = useCurrency();
  const fmt = (n: number) => fmtBase(n);
  const [filter, setFilter] = useState<MortgageTxnType | 'all'>('all');

  const sorted = [...transactions]
    .filter((t) => filter === 'all' || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const totalRepaid = transactions
    .filter((t) => t.type === 'repayment')
    .reduce((s, t) => s + t.amount, 0);
  const totalPrincipal = transactions
    .filter((t) => t.type === 'repayment')
    .reduce((s, t) => s + (t.principal ?? 0), 0);
  const totalInterest = transactions
    .filter((t) => t.type === 'repayment')
    .reduce((s, t) => s + (t.interest ?? 0), 0);
  const rateChanges = transactions.filter((t) => t.type === 'rate_change').length;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900">Transaction History</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {transactions.length} transactions recorded
          </p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={14} /> Record Transaction
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3 p-5 border-b border-slate-50">
        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">Total Repaid</p>
          <p className="text-sm font-semibold text-slate-800">{fmt(totalRepaid)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">Principal Paid</p>
          <p className="text-sm font-semibold text-indigo-600">{fmt(totalPrincipal)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">Interest Paid</p>
          <p className="text-sm font-semibold text-rose-500">{fmt(totalInterest)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-slate-400 mb-0.5">Rate Changes</p>
          <p className="text-sm font-semibold text-amber-600">{rateChanges}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 px-5 py-3 border-b border-slate-50">
        <Filter size={12} className="text-slate-400 mr-1" />
        <span className="text-xs text-slate-400 mr-2">Filter:</span>
        {(['all', 'repayment', 'valuation', 'rate_change'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              filter === f
                ? 'bg-indigo-100 text-indigo-700 font-medium'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {f === 'all' ? 'All' : TXN_META[f].label + 's'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="divide-y divide-slate-50">
        {sorted.length === 0 && (
          <p className="text-center py-10 text-slate-400 text-sm">
            No transactions.{' '}
            <button onClick={onAdd} className="text-indigo-500 hover:underline">
              Add one
            </button>
          </p>
        )}
        {sorted.map((t) => {
          const m = TXN_META[t.type];
          const Icon = m.icon;
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 px-5 py-3 group hover:bg-slate-50/60 transition-colors"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${m.bg}`}
              >
                <Icon size={14} className={m.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700">{t.note || m.label}</p>
                <p className="text-xs text-slate-400">{fmtDate(t.date)}</p>
              </div>
              {/* Amount display per type */}
              {t.type === 'repayment' && (
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-slate-700">−{fmt(t.amount)}</p>
                  <p className="text-[10px] text-slate-400">
                    <span className="text-rose-400">{fmt(t.interest ?? 0)} int</span>
                    {' · '}
                    <span className="text-indigo-500">{fmt(t.principal ?? 0)} prin</span>
                  </p>
                </div>
              )}
              {t.type === 'valuation' && (
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-emerald-600">{fmt(t.amount)}</p>
                  <p className="text-[10px] text-slate-400">new value</p>
                </div>
              )}
              {t.type === 'rate_change' && (
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-amber-600">{t.amount}%</p>
                  <p className="text-[10px] text-slate-400">
                    {t.fixedYears ? `fixed ${t.fixedYears}yr` : 'new rate'}
                  </p>
                </div>
              )}
              <button
                onClick={() => onDelete(t.id)}
                className="p-1.5 rounded hover:bg-rose-50 text-slate-200 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
