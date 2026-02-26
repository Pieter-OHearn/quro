import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui/TxnHistoryPanel';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { PENSION_TXN_META, type PensionTxnType } from '../constants';

// ─── Types ───────────────────────────────────────────────────────────────────

type PensionTxnHistoryProps = {
  pot: PensionPot;
  transactions: PensionTransaction[];
  onAdd: () => void;
  onDelete: (id: number) => void;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'fee', label: 'Fees' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function PensionTxnHistory({
  pot,
  transactions,
  onAdd,
  onDelete,
}: PensionTxnHistoryProps): JSX.Element {
  const { fmtNative } = useCurrency();
  const [filter, setFilter] = useState<PensionTxnType | 'all'>('all');

  const potTxns = transactions.filter((t) => t.potId === pot.id);

  const sorted = potTxns
    .filter((t) => filter === 'all' || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalContributions = potTxns
    .filter((t) => t.type === 'contribution')
    .reduce((s, t) => s + t.amount, 0);
  const employeeContribs = potTxns
    .filter((t) => t.type === 'contribution' && !t.isEmployer)
    .reduce((s, t) => s + t.amount, 0);
  const employerContribs = potTxns
    .filter((t) => t.type === 'contribution' && t.isEmployer)
    .reduce((s, t) => s + t.amount, 0);
  const totalFees = potTxns.filter((t) => t.type === 'fee').reduce((s, t) => s + t.amount, 0);

  const stats = [
    {
      label: 'Total Contributions',
      value: `+${fmtNative(totalContributions, pot.currency, true)}`,
      color: 'text-emerald-600',
    },
    {
      label: 'Employee',
      value: fmtNative(employeeContribs, pot.currency, true),
      color: 'text-slate-800',
    },
    {
      label: 'Employer',
      value: fmtNative(employerContribs, pot.currency, true),
      color: 'text-indigo-600',
    },
    {
      label: 'Total Fees',
      value: `\u2212${fmtNative(totalFees, pot.currency, true)}`,
      color: 'text-rose-500',
    },
  ];

  return (
    <TxnHistoryPanel
      filterOptions={FILTER_OPTIONS}
      filter={filter}
      onFilterChange={(key) => setFilter(key as PensionTxnType | 'all')}
      stats={stats}
      statsColumns={4}
      onAdd={onAdd}
      accentColor="bg-amber-500 hover:bg-amber-600"
      emptyMessage="No transactions."
      isEmpty={sorted.length === 0}
    >
      {sorted.map((t) => {
        const m = PENSION_TXN_META[t.type];
        const isFee = t.type === 'fee';
        return (
          <TxnRow
            key={t.id}
            icon={m.icon}
            iconColor={m.color}
            iconBg={m.bg}
            label={t.note || m.label}
            date={t.date}
            badge={
              t.isEmployer
                ? { text: 'Employer', className: 'bg-indigo-100 text-indigo-600' }
                : undefined
            }
            amount={
              <div className="text-right flex-shrink-0">
                <p
                  className={`text-sm font-semibold ${isFee ? 'text-rose-500' : 'text-emerald-600'}`}
                >
                  {isFee ? '\u2212' : '+'}
                  {fmtNative(t.amount, pot.currency, true)}
                </p>
              </div>
            }
            onDelete={() => onDelete(t.id)}
          />
        );
      })}
    </TxnHistoryPanel>
  );
}
