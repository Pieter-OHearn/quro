import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui';
import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';
import type { MortgageTxnType } from '../types';
import { formatAsNegative } from '@/lib/liability';
import { MORTGAGE_TXN_FILTER_OPTIONS, TXN_META } from '../utils/mortgage-meta';

type MortgageTxnHistoryProps = {
  mortgage: MortgageType;
  currency?: string;
  transactions: MortgageTransaction[];
  onAdd: () => void;
  onEdit: (transaction: MortgageTransaction) => void;
  onDelete: (id: number) => void;
};

type MortgageTxnRowProps = {
  t: MortgageTransaction;
  fmt: (n: number) => string;
  onEdit: (transaction: MortgageTransaction) => void;
  onDelete: (id: number) => void;
};
function describeMortgageTxn(t: MortgageTransaction, fmt: (n: number) => string) {
  if (t.type === 'repayment') {
    return {
      amount: formatAsNegative(fmt, t.amount),
      caption: `${fmt(t.interest ?? 0)} int · ${fmt(t.principal ?? 0)} prin`,
    };
  }
  if (t.type === 'valuation') return { amount: fmt(t.amount), caption: 'new value' };
  return {
    amount: `${t.amount}%`,
    caption: t.fixedYears ? `fixed ${t.fixedYears}yr` : 'new rate',
  };
}

// One line on desktop with the detail before the amount; below 640px the detail sits under it.
function MortgageTxnAmount({ t, fmt }: Pick<MortgageTxnRowProps, 't' | 'fmt'>) {
  const { amount, caption } = describeMortgageTxn(t, fmt);
  return (
    <span className="flex items-baseline justify-end gap-2 max-sm:flex-col max-sm:items-end max-sm:gap-0">
      <span className="text-caption text-fg-subtle max-sm:order-last">{caption}</span>
      <span className="text-cell text-fg">{amount}</span>
    </span>
  );
}

function MortgageTxnRow({ t, fmt, onEdit, onDelete }: MortgageTxnRowProps) {
  const m = TXN_META[t.type];
  return (
    <TxnRow
      icon={m.icon}
      iconColor="text-fg-muted"
      iconBg={m.bg}
      label={t.note || m.label}
      date={t.date}
      amount={<MortgageTxnAmount t={t} fmt={fmt} />}
      onEdit={() => onEdit(t)}
      onDelete={() => onDelete(t.id)}
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
    { label: 'Total Repaid', value: fmt(totalRepaid) },
    { label: 'Principal Paid', value: fmt(totalPrincipal) },
    { label: 'Interest Paid', value: fmt(totalInterest) },
    { label: 'Rate Changes', value: String(rateChanges) },
  ];
}

export function MortgageTxnHistory({
  mortgage: _mortgage,
  currency,
  transactions,
  onAdd,
  onEdit,
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
        <MortgageTxnRow key={t.id} t={t} fmt={fmt} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </TxnHistoryPanel>
  );
}
