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
import type { SavingsAccount } from '@quro/shared';
import { TXN_META, TXN_TYPE_LIST } from '../constants';
import type { SaveTransactionInput, TxnType } from '../types';

function toFiniteNumber(value: number): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

type AddTxnModalProps = {
  account: SavingsAccount;
  onClose: () => void;
  onSave: (transaction: SaveTransactionInput) => void;
};

type BalancePreviewProps = {
  type: TxnType;
  parsed: number;
  account: SavingsAccount;
  fmtNative: (v: number, c: string, d?: boolean) => string;
};

function BalancePreview({ type, parsed, account, fmtNative }: BalancePreviewProps) {
  const currentBalance = toFiniteNumber(account.balance);
  const signedAmount = type === 'withdrawal' ? -Math.abs(parsed) : Math.abs(parsed);
  const newBalance = currentBalance + signedAmount;

  return (
    <div
      className={`rounded-xl p-4 border ${type === 'withdrawal' ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-600">Balance after transaction</span>
        <span className={`font-bold ${newBalance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
          {fmtNative(newBalance, account.currency, true)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{fmtNative(currentBalance, account.currency, true)}</span>
        <span>{type === 'withdrawal' ? '\u2212' : '+'}</span>
        <span className={TXN_META[type].color}>{fmtNative(parsed, account.currency, true)}</span>
        <span>=</span>
        <span className="font-semibold">{fmtNative(newBalance, account.currency, true)}</span>
      </div>
    </div>
  );
}

function useAddTxnForm(
  account: SavingsAccount,
  onSave: (transaction: SaveTransactionInput) => void,
  onClose: () => void,
) {
  const [type, setType] = useState<TxnType>('deposit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const parsed = parseFloat(amount) || 0;
  const accountBalance = toFiniteNumber(account.balance);

  function handleSave(): void {
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (type === 'withdrawal' && parsed > accountBalance) {
      setError('Amount exceeds account balance');
      return;
    }
    onSave({ accountId: account.id, type, amount: parsed, date, note });
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
    handleSave,
  };
}

export function AddTxnModal({ account, onClose, onSave }: AddTxnModalProps) {
  const { fmtNative } = useCurrency();
  const form = useAddTxnForm(account, onSave, onClose);
  return (
    <Modal
      title="Add Transaction"
      subtitle={`${account.emoji} ${account.name}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={form.handleSave}
          confirmLabel="Record Transaction"
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
          account={account}
          fmtNative={fmtNative}
        />
      )}
    </Modal>
  );
}
