import { useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  IconButton,
  Modal,
  ModalFooter,
  Pagination,
  RowActions,
  type DataTableColumn,
  type DataTableSortState,
} from '@/components/ui';
import type { BudgetCategory, BudgetFormatFn, RecentBudgetTx } from '../types';

const PAGE_SIZE = 6;
const SORT_ASCENDING = 1;
const SORT_DESCENDING = -1;

const TRANSACTION_COLUMNS: readonly DataTableColumn[] = [
  {
    key: 'transaction',
    header: 'Transaction',
    mobileLabel: 'Transaction',
    width: '38%',
    sortable: true,
  },
  {
    key: 'date',
    header: 'Date',
    mobileLabel: 'Date',
    width: '16%',
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'whitespace-nowrap text-slate-500',
  },
  {
    key: 'category',
    header: 'Category',
    mobileLabel: 'Category',
    width: '20%',
    sortable: true,
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    mobileLabel: 'Amount',
    width: '16%',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'whitespace-nowrap font-semibold text-slate-800',
  },
  { key: 'actions', header: '', priority: 'actions', width: 64 },
];

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

function isReadOnlyBunqTransaction(transaction: RecentBudgetTx): boolean {
  return transaction.sourceProvider === 'bunq' || Boolean(transaction.bunqTransactionId);
}

function getBunqMetadataTitle(transaction: RecentBudgetTx): string {
  return [
    'Bunq synced transaction',
    transaction.sourceAccountName ? `Account: ${transaction.sourceAccountName}` : null,
    transaction.sourceAccountType ? `Type: ${transaction.sourceAccountType}` : null,
    transaction.sourceAccountId ? `ID: ${transaction.sourceAccountId}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function TransactionRow({ transaction, fmtDec, onEdit }: Readonly<RowProps>) {
  const isReadOnly = isReadOnlyBunqTransaction(transaction);
  return (
    <DataTableRow interactive>
      <DataTableCell columnKey="transaction">
        <div className="flex min-w-0 items-center gap-3">
          <span className="w-8 shrink-0 text-center text-xl">{transaction.emoji}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-slate-800">{transaction.name}</p>
              {isReadOnly && (
                <Badge
                  tone="info"
                  size="sm"
                  className="bg-blue-500 text-white"
                  title={getBunqMetadataTitle(transaction)}
                >
                  Bunq
                </Badge>
              )}
              {transaction.sourceProvider === 'bunq' &&
                transaction.sourceAccountType === 'JOINT' && (
                  <Badge
                    tone="success"
                    size="sm"
                    title={transaction.sourceAccountName ?? 'Joint account'}
                  >
                    Joint
                  </Badge>
                )}
            </div>
          </div>
        </div>
      </DataTableCell>
      <DataTableCell columnKey="date">{transaction.date}</DataTableCell>
      <DataTableCell columnKey="category">
        {transaction.category && transaction.color ? (
          <Badge size="sm" className="text-white" style={{ backgroundColor: transaction.color }}>
            {transaction.category}
          </Badge>
        ) : (
          <span className="text-slate-400">Uncategorized</span>
        )}
      </DataTableCell>
      <DataTableCell columnKey="amount">-{fmtDec(transaction.amount)}</DataTableCell>
      <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
        {!isReadOnly && (
          <RowActions>
            <IconButton
              type="button"
              onClick={onEdit}
              icon={Pencil}
              label="Edit transaction"
              title="Edit transaction"
              variant="ghost"
              size="sm"
            />
          </RowActions>
        )}
      </DataTableCell>
    </DataTableRow>
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
  const [sort, setSort] = useState<DataTableSortState>({ columnKey: 'date', direction: 'desc' });
  const sortedTransactions = useMemo(() => {
    const direction = sort.direction === 'asc' ? SORT_ASCENDING : SORT_DESCENDING;

    return [...transactions].sort((a, b) => {
      const comparison = getTransactionSortComparison(a, b, sort.columnKey);

      return comparison * direction || b.date.localeCompare(a.date) || b.id - a.id;
    });
  }, [sort, transactions]);
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
  }, [selectedMonth, selectedYear, sort]);

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
    sort,
    setSort,
    handlePageChange,
  };
}

function getTransactionSortComparison(a: RecentBudgetTx, b: RecentBudgetTx, columnKey: string) {
  if (columnKey === 'transaction') return a.name.localeCompare(b.name);
  if (columnKey === 'category') return (a.category ?? '').localeCompare(b.category ?? '');
  if (columnKey === 'amount') return a.amount - b.amount;
  return a.date.localeCompare(b.date);
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
  const hasTransactions = pagination.sortedTransactions.length > 0;

  return (
    <>
      <DataTable
        title="Monthly Transactions"
        subtitle={`${selectedMonth} ${selectedYear}`}
        action={
          <Badge tone="neutral" size="md">
            {pagination.sortedTransactions.length}
          </Badge>
        }
        columns={TRANSACTION_COLUMNS}
        sort={pagination.sort}
        onSortChange={pagination.setSort}
        isEmpty={!hasTransactions}
        emptyState="No transactions for this month."
        minWidth={760}
        tableLayout="fixed"
        tableVariant="financial"
        footer={
          hasTransactions && pagination.totalPages > 1 ? (
            <Pagination
              page={pagination.safeCurrentPage}
              totalPages={pagination.totalPages}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              totalCount={pagination.sortedTransactions.length}
              onChange={pagination.handlePageChange}
            />
          ) : null
        }
      >
        {pagination.paginatedTransactions.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            fmtDec={fmtDec}
            onEdit={() => {
              if (isReadOnlyBunqTransaction(tx)) return;
              setEditing(tx);
            }}
          />
        ))}
      </DataTable>
      {editing && (
        <EditTransactionModal
          transaction={editing}
          categories={categories}
          onSave={(categoryId) => onChangeCategory(editing.id, categoryId)}
          onDelete={() => onDelete(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
