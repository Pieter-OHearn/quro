import { usePagination } from '@/hooks/usePagination';
import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { Pagination, TxnHistoryPanel, TxnRow } from '@/components/ui';
import { TxnAmount } from '@/components/finance/TxnAmount';
import { signedSavingsAmount, type SavingsAccount, type SavingsTransaction } from '@quro/shared';
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

  const sorted = [...transactions]
    .filter((t) => t.accountId === account.id && (filter === 'all' || t.type === filter))
    .sort((a, b) => b.date.localeCompare(a.date));
  const {
    pageItems: paginatedTransactions,
    totalPages,
    safeCurrentPage,
    rangeStart,
    rangeEnd,
    handlePageChange,
  } = usePagination(sorted, PAGE_SIZE, `${account.id}:${filter}`);

  return (
    <TxnHistoryPanel
      filterOptions={FILTER_OPTIONS}
      filter={filter}
      onFilterChange={(key) => setFilter(key as TxnType | 'all')}
      onAdd={account.bunqAccountId ? undefined : onAdd}
      addLabel="Add transaction"
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
        // The type moves to a badge when a note takes the label; phones hide it for the label.
        const badgeText = [t.bunqTransactionId ? 'Bunq' : null, t.note ? m.label : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <TxnRow
            key={t.id}
            icon={m.icon}
            iconColor={m.color}
            label={t.note || m.label}
            date={t.date}
            badge={badgeText ? { text: badgeText, className: 'max-sm:hidden' } : undefined}
            amount={
              <TxnAmount
                value={signedSavingsAmount(t.type as TxnType, t.amount)}
                format={(amount) => fmtNative(amount, account.currency, true)}
              />
            }
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t.id)}
          />
        );
      })}
    </TxnHistoryPanel>
  );
}
