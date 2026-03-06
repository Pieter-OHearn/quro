import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  Modal,
  ModalFooter,
  FormField,
  CurrencyInput,
  TxnTypeSelector,
  DateNoteRow,
} from '@/components/ui';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { TXN_META, TXN_TYPE_LIST } from '../constants';
import type { SaveTransactionInput, TxnType } from '../types';

function toFiniteNumber(value: number): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

type AddTxnModalProps = {
  account: SavingsAccount;
  existing?: SavingsTransaction;
  onClose: () => void;
  onSave: (transaction: SaveTransactionInput) => void;
};

function signedAmount(type: TxnType, amount: number): number {
  const absoluteAmount = Math.abs(amount);
  return type === 'withdrawal' ? -absoluteAmount : absoluteAmount;
}

type BalancePreviewProps = {
  type: TxnType;
  parsed: number;
  currency: string;
  balanceBeforeTxn: number;
  fmtNative: (v: number, c: string, d?: boolean) => string;
};

function BalancePreview({
  type,
  parsed,
  currency,
  balanceBeforeTxn,
  fmtNative,
}: BalancePreviewProps) {
  const newBalance = balanceBeforeTxn + signedAmount(type, parsed);

  return (
    <div
      className={`rounded-xl p-4 border ${type === 'withdrawal' ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-600">Balance after transaction</span>
        <span className={`font-bold ${newBalance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
          {fmtNative(newBalance, currency, true)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{fmtNative(balanceBeforeTxn, currency, true)}</span>
        <span>{type === 'withdrawal' ? '\u2212' : '+'}</span>
        <span className={TXN_META[type].color}>{fmtNative(parsed, currency, true)}</span>
        <span>=</span>
        <span className="font-semibold">{fmtNative(newBalance, currency, true)}</span>
      </div>
    </div>
  );
}

function useAddTxnForm(
  account: SavingsAccount,
  existing: SavingsTransaction | undefined,
  onSave: (transaction: SaveTransactionInput) => void,
  onClose: () => void,
) {
  const [type, setType] = useState<TxnType>(existing?.type ?? 'deposit');
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState('');

  const parsed = parseFloat(amount) || 0;
  const accountBalance = toFiniteNumber(account.balance);
  const existingSignedAmount = existing
    ? signedAmount(existing.type, toFiniteNumber(existing.amount))
    : 0;
  const balanceBeforeTxn = accountBalance - existingSignedAmount;

  function handleSave(): void {
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (type === 'withdrawal' && parsed > balanceBeforeTxn) {
      setError('Amount exceeds account balance');
      return;
    }
    const payload = { accountId: account.id, type, amount: parsed, date, note };
    onSave(existing ? { id: existing.id, ...payload } : payload);
    onClose();
  }

  return {
    type,
    setType,
    amount,
    setAmount,
    date,
    setDate,
    note,
    setNote,
    error,
    setError,
    parsed,
    balanceBeforeTxn,
    handleSave,
  };
}

export function AddTxnModal({ account, existing, onClose, onSave }: AddTxnModalProps) {
  const { fmtNative } = useCurrency();
  const form = useAddTxnForm(account, existing, onSave, onClose);
  const isEditing = Boolean(existing);
  return (
    <Modal
      title={isEditing ? 'Edit Transaction' : 'Add Transaction'}
      subtitle={`${account.emoji} ${account.name}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={form.handleSave}
          confirmLabel={isEditing ? 'Save Changes' : 'Record Transaction'}
        />
      }
    >
      <FormField label="Transaction Type">
        <TxnTypeSelector
          types={TXN_TYPE_LIST}
          value={form.type}
          onChange={(t) => {
            form.setType(t as TxnType);
            form.setError('');
          }}
        />
      </FormField>
      <FormField label={`Amount (${account.currency})`} error={form.error}>
        <CurrencyInput
          currency={account.currency}
          value={form.amount}
          onChange={(v) => {
            form.setAmount(v);
            form.setError('');
          }}
          error={Boolean(form.error)}
        />
      </FormField>
      <DateNoteRow
        date={form.date}
        note={form.note}
        onDateChange={form.setDate}
        onNoteChange={form.setNote}
        notePlaceholder="e.g. Monthly transfer, Quarterly interest..."
      />
      {form.parsed > 0 && (
        <BalancePreview
          type={form.type}
          parsed={form.parsed}
          currency={account.currency}
          balanceBeforeTxn={form.balanceBeforeTxn}
          fmtNative={fmtNative}
        />
      )}
    </Modal>
  );
}
