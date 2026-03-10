import { useEffect, useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { Pagination, TxnHistoryPanel, TxnRow } from '@/components/ui';
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
          <Pagination
            page={safeCurrentPage}
            totalPages={totalPages}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            totalCount={sorted.length}
            onChange={handlePageChange}
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
