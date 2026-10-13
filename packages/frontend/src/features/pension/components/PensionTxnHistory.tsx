import { usePagination } from '@/hooks/usePagination';
import { useState } from 'react';
import { Pagination, TxnHistoryPanel, TxnRow } from '@/components/ui';
import { TxnAmount } from '@/components/finance/TxnAmount';
import { useCurrency } from '@/lib/CurrencyContext';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { PENSION_TXN_META } from '../constants';
import type { PensionTxnType } from '../types';
import { buildPensionTxnStats } from '../utils/pension-transaction-stats';

type PensionTxnHistoryProps = {
  pot: PensionPot;
  transactions: PensionTransaction[];
  onAdd: () => void;
  onEdit: (transaction: PensionTransaction) => void;
  onDelete: (id: number) => void;
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'fee', label: 'Fees' },
  { key: 'annual_statement', label: 'Annual statements' },
];
const PAGE_SIZE = 6;

function PensionTxnRow({
  transaction,
  currency,
  fmtNative,
  onEdit,
  onDelete,
}: Readonly<{
  transaction: PensionTransaction;
  currency: string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  onEdit: () => void;
  onDelete: () => void;
}>) {
  const meta = PENSION_TXN_META[transaction.type];
  const signedAmount =
    transaction.type === 'contribution'
      ? transaction.amount - transaction.taxAmount
      : transaction.type === 'fee'
        ? -transaction.amount
        : transaction.amount;
  const isEmployerContribution = transaction.type === 'contribution' && transaction.isEmployer;
  // The type moves to a badge when a note takes the label.
  const badgeText = [
    isEmployerContribution ? 'Employer' : null,
    transaction.note ? meta.label : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TxnRow
      icon={meta.icon}
      iconColor={meta.color}
      label={transaction.note || meta.label}
      date={transaction.date}
      badge={badgeText ? { text: badgeText, className: '' } : undefined}
      amount={
        <TxnAmount value={signedAmount} format={(amount) => fmtNative(amount, currency, true)} />
      }
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}

export function PensionTxnHistory({
  pot,
  transactions,
  onAdd,
  onEdit,
  onDelete,
}: PensionTxnHistoryProps) {
  const { fmtNative } = useCurrency();
  const [filter, setFilter] = useState<PensionTxnType | 'all'>('all');

  const potTxns = transactions.filter((transaction) => transaction.potId === pot.id);
  const sortedTransactions = potTxns
    .filter((transaction) => filter === 'all' || transaction.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));
  const {
    pageItems: paginatedTransactions,
    totalPages,
    safeCurrentPage,
    rangeStart,
    rangeEnd,
    handlePageChange,
  } = usePagination(sortedTransactions, PAGE_SIZE, `${pot.id}:${filter}`);

  const stats = buildPensionTxnStats(potTxns, pot.currency, fmtNative);

  return (
    <TxnHistoryPanel
      filterOptions={FILTER_OPTIONS}
      filter={filter}
      onFilterChange={(key) => setFilter(key as PensionTxnType | 'all')}
      stats={stats}
      statsColumns={5}
      onAdd={onAdd}
      addLabel="Add transaction"
      emptyMessage="No transactions."
      isEmpty={sortedTransactions.length === 0}
      footer={
        totalPages > 1 ? (
          <Pagination
            page={safeCurrentPage}
            totalPages={totalPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            totalCount={sortedTransactions.length}
            onChange={handlePageChange}
          />
        ) : undefined
      }
    >
      {paginatedTransactions.map((transaction) => (
        <PensionTxnRow
          key={transaction.id}
          transaction={transaction}
          currency={pot.currency}
          fmtNative={fmtNative}
          onEdit={() => onEdit(transaction)}
          onDelete={() => onDelete(transaction.id)}
        />
      ))}
    </TxnHistoryPanel>
  );
}
