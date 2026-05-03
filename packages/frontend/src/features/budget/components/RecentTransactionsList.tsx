import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button, Modal, ModalFooter } from '@/components/ui';
import type { BudgetCategory, BudgetFormatFn, RecentBudgetTx } from '../types';

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
            onSave(categoryId);
            onClose();
          }}
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
        value={categoryId}
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
          <p className="text-sm font-medium text-slate-800">{transaction.name}</p>
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
        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-slate-600 p-1 rounded-lg"
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
  onDelete: (id: number) => void;
  onChangeCategory: (id: number, categoryId: number) => void;
};

export function RecentTransactionsList({
  transactions,
  categories,
  fmtDec,
  onDelete,
  onChangeCategory,
}: Readonly<RecentTransactionsListProps>) {
  const [editing, setEditing] = useState<RecentBudgetTx | null>(null);

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-5">Recent Transactions</h3>
      {transactions.length > 0 ? (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              transaction={tx}
              fmtDec={fmtDec}
              onEdit={() => setEditing(tx)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">No transactions yet.</p>
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
