import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui';
import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';
import type { MortgageTxnType } from '../types';
import { MORTGAGE_TXN_FILTER_OPTIONS, TXN_META } from '../utils/mortgage-meta';

type MortgageTxnHistoryProps = {
  mortgage: MortgageType;
  currency?: string;
  transactions: MortgageTransaction[];
  onAdd: () => void;
  onDelete: (id: number) => void;
};

type MortgageTxnRowProps = {
  t: MortgageTransaction;
  fmt: (n: number) => string;
  onDelete: (id: number) => void;
};
function MortgageTxnAmount({ t, fmt }: Pick<MortgageTxnRowProps, 't' | 'fmt'>) {
  if (t.type === 'repayment') {
    return (
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-slate-700">-{fmt(t.amount)}</p>
        <p className="text-[10px] text-slate-400">
          <span className="text-rose-400">{fmt(t.interest ?? 0)} int</span>
          {' · '}
          <span className="text-indigo-500">{fmt(t.principal ?? 0)} prin</span>
        </p>
      </div>
    );
  }

  if (t.type === 'valuation') {
    return (
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-emerald-600">{fmt(t.amount)}</p>
        <p className="text-[10px] text-slate-400">new value</p>
      </div>
    );
  }

  return (
    <div className="text-right flex-shrink-0">
      <p className="text-sm font-semibold text-amber-600">{t.amount}%</p>
      <p className="text-[10px] text-slate-400">
        {t.fixedYears ? `fixed ${t.fixedYears}yr` : 'new rate'}
      </p>
    </div>
  );
}

function MortgageTxnRow({ t, fmt, onDelete }: MortgageTxnRowProps) {
  const m = TXN_META[t.type];
  return (
    <TxnRow
      icon={m.icon}
      iconColor={m.color}
      iconBg={m.bg}
      iconContainerClassName="w-9 h-9 rounded-xl"
      iconSize={14}
      label={t.note || m.label}
      labelClassName="text-sm font-medium text-slate-700"
      date={t.date}
      dateClassName="text-xs text-slate-400"
      amount={<MortgageTxnAmount t={t} fmt={fmt} />}
      onDelete={() => onDelete(t.id)}
      className="rounded-none border-0 bg-transparent px-5 py-3 hover:bg-slate-50/60"
    />
  );
}

type MortgageSummaryStatsProps = {
  transactions: MortgageTransaction[];
  fmt: (n: number) => string;
};
function buildMortgageTxnStats({ transactions, fmt }: MortgageSummaryStatsProps) {
  const repayments = transactions.filter((t) => t.type === 'repayment');
  const totalRepaid = repayments.reduce((s, t) => s + t.amount, 0);
  const totalPrincipal = repayments.reduce((s, t) => s + (t.principal ?? 0), 0);
  const totalInterest = repayments.reduce((s, t) => s + (t.interest ?? 0), 0);
  const rateChanges = transactions.filter((t) => t.type === 'rate_change').length;
  return [
    { label: 'Total Repaid', value: fmt(totalRepaid), color: 'text-slate-800' },
    { label: 'Principal Paid', value: fmt(totalPrincipal), color: 'text-indigo-600' },
    { label: 'Interest Paid', value: fmt(totalInterest), color: 'text-rose-500' },
    { label: 'Rate Changes', value: String(rateChanges), color: 'text-amber-600' },
  ];
}

export function MortgageTxnHistory({
  mortgage: _mortgage,
  currency,
  transactions,
  onAdd,
  onDelete,
}: MortgageTxnHistoryProps) {
  const { fmtBase } = useCurrency();
  const fmt = (n: number) => fmtBase(n, currency);
  const [filter, setFilter] = useState<MortgageTxnType | 'all'>('all');
  const sorted = [...transactions]
    .filter((t) => filter === 'all' || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <TxnHistoryPanel
      title="Transaction History"
      subtitle={`${transactions.length} transactions recorded`}
      variant="card"
      addButtonPlacement="header"
      filterOptions={MORTGAGE_TXN_FILTER_OPTIONS.map((option) => ({
        key: option,
        label: option === 'all' ? 'All' : `${TXN_META[option].label}s`,
      }))}
      filter={filter}
      onFilterChange={(key) => setFilter(key as MortgageTxnType | 'all')}
      stats={buildMortgageTxnStats({ transactions, fmt })}
      statsColumns={4}
      onAdd={onAdd}
      addLabel="Record Transaction"
      isEmpty={sorted.length === 0}
    >
      {sorted.map((t) => (
        <MortgageTxnRow key={t.id} t={t} fmt={fmt} onDelete={onDelete} />
      ))}
    </TxnHistoryPanel>
  );
}
