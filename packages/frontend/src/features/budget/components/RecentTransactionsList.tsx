import { useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button, Modal, ModalFooter, Pagination } from '@/components/ui';
import type { BudgetCategory, BudgetFormatFn, RecentBudgetTx } from '../types';

const PAGE_SIZE = 6;

type EditModalProps = {
  transaction: RecentBudgetTx;
  categories: readonly BudgetCategory[];
  onSave: (categoryId: number) => void;
  onDelete: () => void;
  onClose: () => void;
};

function EditTransactionModal({
  transaction,
  categories,
  onSave,
  onDelete,
  onClose,
}: Readonly<EditModalProps>) {
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? categories[0]?.id);

  return (
    <Modal
      title="Edit transaction"
      subtitle={transaction.name}
      onClose={onClose}
      maxWidth="sm"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => {
            if (categoryId === undefined) return;
            onSave(categoryId);
            onClose();
          }}
          disabled={categoryId === undefined}
          danger={
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              Delete
            </Button>
          }
        />
      }
    >
      <select
        value={categoryId ?? ''}
        onChange={(e) => setCategoryId(Number(e.target.value))}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.emoji} {cat.name}
          </option>
        ))}
      </select>
    </Modal>
  );
}

type RowProps = {
  transaction: RecentBudgetTx;
  fmtDec: BudgetFormatFn;
  onEdit: () => void;
};

function TransactionRow({ transaction, fmtDec, onEdit }: Readonly<RowProps>) {
  return (
    <div className="group flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
      <span className="text-xl w-8 text-center">{transaction.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-800">{transaction.name}</p>
          {transaction.bunqTransactionId && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500 text-white font-medium">
              Bunq
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{transaction.date}</span>
          {transaction.category && transaction.color && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: transaction.color }}
            >
              {transaction.category}
            </span>
          )}
        </div>
      </div>
      <p className="font-semibold text-slate-800 tabular-nums">-{fmtDec(transaction.amount)}</p>
      <button
        type="button"
        onClick={onEdit}
        className="p-1 rounded-lg text-slate-300 opacity-100 transition-opacity hover:text-slate-600 sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Edit transaction"
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}

type RecentTransactionsListProps = {
  transactions: RecentBudgetTx[];
  categories: readonly BudgetCategory[];
  fmtDec: BudgetFormatFn;
  selectedMonth: string;
  selectedYear: number;
  onDelete: (id: number) => void;
  onChangeCategory: (id: number, categoryId: number) => void;
};

function useMonthlyTransactionPagination(
  transactions: RecentBudgetTx[],
  selectedMonth: string,
  selectedYear: number,
) {
  const [currentPage, setCurrentPage] = useState(1);
  const sortedTransactions = useMemo(
    () => [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    [transactions],
  );
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
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return {
    sortedTransactions,
    paginatedTransactions,
    totalPages,
    safeCurrentPage,
    rangeStart,
    rangeEnd,
    handlePageChange,
  };
}

export function RecentTransactionsList({
  transactions,
  categories,
  fmtDec,
  selectedMonth,
  selectedYear,
  onDelete,
  onChangeCategory,
}: Readonly<RecentTransactionsListProps>) {
  const [editing, setEditing] = useState<RecentBudgetTx | null>(null);
  const pagination = useMonthlyTransactionPagination(transactions, selectedMonth, selectedYear);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Monthly Transactions</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {selectedMonth} {selectedYear}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
          {pagination.sortedTransactions.length}
        </span>
      </div>
      {pagination.sortedTransactions.length > 0 ? (
        <div>
          <div className="space-y-2">
            {pagination.paginatedTransactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                fmtDec={fmtDec}
                onEdit={() => setEditing(tx)}
              />
            ))}
          </div>
          {pagination.totalPages > 1 && (
            <Pagination
              page={pagination.safeCurrentPage}
              totalPages={pagination.totalPages}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              totalCount={pagination.sortedTransactions.length}
              onChange={pagination.handlePageChange}
            />
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">No transactions for this month.</p>
      )}
      {editing && (
        <EditTransactionModal
          transaction={editing}
          categories={categories}
          onSave={(categoryId) => onChangeCategory(editing.id, categoryId)}
          onDelete={() => onDelete(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
