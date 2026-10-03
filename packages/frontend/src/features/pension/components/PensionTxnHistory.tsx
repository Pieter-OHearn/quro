import { usePagination } from '@/hooks/usePagination';
import { useState } from 'react';
import { Pagination, TxnHistoryPanel, TxnRow } from '@/components/ui';
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
  { key: 'annual_statement', label: 'Annual Statements' },
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
  const isDeduction = signedAmount < 0;
  const displayAmount = Math.abs(signedAmount);

  return (
    <TxnRow
      key={transaction.id}
      icon={meta.icon}
      iconColor={meta.color}
      iconBg={meta.bg}
      label={transaction.note || meta.label}
      date={transaction.date}
      badge={
        transaction.type === 'contribution' && transaction.isEmployer
          ? { text: 'Employer', className: 'bg-brand-soft-strong text-brand' }
          : undefined
      }
      amount={
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-semibold ${isDeduction ? 'text-danger' : 'text-success'}`}>
            {isDeduction ? '\u2212' : '+'}
            {fmtNative(displayAmount, currency, true)}
          </p>
        </div>
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
      accentColor="bg-warning-accent hover:bg-warning"
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
            activePageClassName="bg-warning-accent text-fg-inverted"
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
