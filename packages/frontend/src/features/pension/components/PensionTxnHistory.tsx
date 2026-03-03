import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui/TxnHistoryPanel';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { PENSION_TXN_META } from '../constants';
import type { PensionTxnType } from '../types';
import { buildPensionTxnStats } from '../utils/pension-transaction-stats';

type PensionTxnHistoryProps = {
  pot: PensionPot;
  transactions: PensionTransaction[];
  onAdd: () => void;
  onDelete: (id: number) => void;
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'fee', label: 'Fees' },
];

function PensionTxnRow({
  transaction,
  currency,
  fmtNative,
  onDelete,
}: Readonly<{
  transaction: PensionTransaction;
  currency: string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  onDelete: () => void;
}>) {
  const meta = PENSION_TXN_META[transaction.type];
  const isFee = transaction.type === 'fee';

  return (
    <TxnRow
      key={transaction.id}
      icon={meta.icon}
      iconColor={meta.color}
      iconBg={meta.bg}
      label={transaction.note || meta.label}
      date={transaction.date}
      badge={
        transaction.isEmployer
          ? { text: 'Employer', className: 'bg-indigo-100 text-indigo-600' }
          : undefined
      }
      amount={
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-semibold ${isFee ? 'text-rose-500' : 'text-emerald-600'}`}>
            {isFee ? '\u2212' : '+'}
            {fmtNative(transaction.amount, currency, true)}
          </p>
        </div>
      }
      onDelete={onDelete}
    />
  );
}

export function PensionTxnHistory({
  pot,
  transactions,
  onAdd,
  onDelete,
}: PensionTxnHistoryProps): JSX.Element {
  const { fmtNative } = useCurrency();
  const [filter, setFilter] = useState<PensionTxnType | 'all'>('all');

  const potTxns = transactions.filter((transaction) => transaction.potId === pot.id);
  const sortedTransactions = potTxns
    .filter((transaction) => filter === 'all' || transaction.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));
  const stats = buildPensionTxnStats(potTxns, pot.currency, fmtNative);

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
      isEmpty={sortedTransactions.length === 0}
    >
      {sortedTransactions.map((transaction) => (
        <PensionTxnRow
          key={transaction.id}
          transaction={transaction}
          currency={pot.currency}
          fmtNative={fmtNative}
          onDelete={() => onDelete(transaction.id)}
        />
      ))}
    </TxnHistoryPanel>
  );
}
