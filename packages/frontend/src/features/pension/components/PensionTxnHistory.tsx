import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  onEdit: (transaction: PensionTransaction) => void;
  onDelete: (id: number) => void;
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'fee', label: 'Fees' },
  { key: 'tax', label: 'Tax' },
];
const PAGE_SIZE = 6;

type PaginationFooterProps = {
  currentPage: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

function PaginationFooter({
  currentPage,
  totalPages,
  rangeStart,
  rangeEnd,
  totalCount,
  onPageChange,
}: Readonly<PaginationFooterProps>) {
  const visiblePageCount = 5;
  const lastWindowStart = Math.max(1, totalPages - visiblePageCount + 1);
  const windowStart =
    totalPages <= visiblePageCount
      ? 1
      : Math.min(Math.max(1, currentPage - (visiblePageCount - 1)), lastWindowStart);
  const windowEnd = Math.min(totalPages, windowStart + visiblePageCount - 1);
  const pageNumbers = Array.from(
    { length: windowEnd - windowStart + 1 },
    (_, index) => windowStart + index,
  );

  return (
    <div className="mt-3 border-t border-slate-200/80 pt-3 flex items-center justify-between gap-2 flex-wrap">
      <p className="text-xs text-slate-400">
        {rangeStart}-{rangeEnd} of {totalCount}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className="w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
        >
          <ChevronLeft size={14} className="mx-auto" />
        </button>
        {pageNumbers.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={
              page === currentPage
                ? 'w-7 h-7 rounded-md text-xs font-semibold bg-amber-500 text-white'
                : 'w-7 h-7 rounded-md text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors'
            }
          >
            {page}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className="w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
        >
          <ChevronRight size={14} className="mx-auto" />
        </button>
      </div>
    </div>
  );
}

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
  const isDeduction = transaction.type !== 'contribution';

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
          <p
            className={`text-sm font-semibold ${isDeduction ? 'text-rose-500' : 'text-emerald-600'}`}
          >
            {isDeduction ? '\u2212' : '+'}
            {fmtNative(transaction.amount, currency, true)}
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
}: PensionTxnHistoryProps): JSX.Element {
  const { fmtNative } = useCurrency();
  const [filter, setFilter] = useState<PensionTxnType | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const potTxns = transactions.filter((transaction) => transaction.potId === pot.id);
  const sortedTransactions = potTxns
    .filter((transaction) => filter === 'all' || transaction.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedTransactions = sortedTransactions.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = sortedTransactions.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = pageStart + paginatedTransactions.length;
  const handlePageChange = (page: number) =>
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, pot.id]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const stats = buildPensionTxnStats(potTxns, pot.currency, fmtNative);

  return (
    <TxnHistoryPanel
      filterOptions={FILTER_OPTIONS}
      filter={filter}
      onFilterChange={(key) => setFilter(key as PensionTxnType | 'all')}
      stats={stats}
      statsColumns={5}
      onAdd={onAdd}
      accentColor="bg-amber-500 hover:bg-amber-600"
      emptyMessage="No transactions."
      isEmpty={sortedTransactions.length === 0}
      footer={
        totalPages > 1 ? (
          <PaginationFooter
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            totalCount={sortedTransactions.length}
            onPageChange={handlePageChange}
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
