import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { TXN_META, FILTER_OPTIONS } from '../constants';
import type { TxnType } from '../types';

type TxnHistoryProps = {
  account: SavingsAccount;
  transactions: SavingsTransaction[];
  onAdd: () => void;
  onEdit: (transaction: SavingsTransaction) => void;
  onDelete: (id: number) => void;
};

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
                ? 'w-7 h-7 rounded-md text-xs font-semibold bg-indigo-600 text-white'
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

export function TxnHistory({ account, transactions, onAdd, onEdit, onDelete }: TxnHistoryProps) {
  const { fmtNative } = useCurrency();
  const [filter, setFilter] = useState<TxnType | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const sorted = [...transactions]
    .filter((t) => t.accountId === account.id && (filter === 'all' || t.type === filter))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedTransactions = sorted.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = sorted.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = pageStart + paginatedTransactions.length;
  const handlePageChange = (page: number) =>
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, account.id]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <TxnHistoryPanel
      filterOptions={FILTER_OPTIONS}
      filter={filter}
      onFilterChange={(key) => setFilter(key as TxnType | 'all')}
      onAdd={onAdd}
      isEmpty={sorted.length === 0}
      footer={
        totalPages > 1 ? (
          <PaginationFooter
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            totalCount={sorted.length}
            onPageChange={handlePageChange}
          />
        ) : undefined
      }
    >
      {paginatedTransactions.map((t) => {
        const m = TXN_META[t.type as TxnType];
        return (
          <TxnRow
            key={t.id}
            icon={m.icon}
            iconColor={m.color}
            iconBg={m.bg}
            label={t.note || m.label}
            date={t.date}
            amount={
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-semibold ${m.color}`}>
                  {m.sign}
                  {fmtNative(t.amount, account.currency, true)}
                </p>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.bg} ${m.color} capitalize`}
                >
                  {m.label}
                </span>
              </div>
            }
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t.id)}
          />
        );
      })}
    </TxnHistoryPanel>
  );
}
