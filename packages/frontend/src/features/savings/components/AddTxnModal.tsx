import { useState } from "react";
import { useCurrency } from "@/lib/CurrencyContext";
import {
  Modal, ModalFooter, FormField, CurrencyInput, TxnTypeSelector, DateNoteRow,
} from "@/components/ui";
import type { SavingsAccount, SavingsTransaction } from "@quro/shared";
import { TXN_META, TXN_TYPE_LIST } from "../constants";
import type { TxnType } from "../constants";

type AddTxnModalProps = {
  account: SavingsAccount;
  onClose: () => void;
  onSave: (t: Omit<SavingsTransaction, "id">) => void;
};

type BalancePreviewProps = {
  type: TxnType;
  parsed: number;
  account: SavingsAccount;
  fmtNative: (v: number, c: string, d?: boolean) => string;
};

function BalancePreview({ type, parsed, account, fmtNative }: BalancePreviewProps) {
  const newBalance = type === "withdrawal"
    ? account.balance - parsed
    : account.balance + parsed;
  return (
    <div className={`rounded-xl p-4 border ${type === "withdrawal" ? "bg-rose-50 border-rose-100" : "bg-emerald-50 border-emerald-100"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-600">Balance after transaction</span>
        <span className={`font-bold ${newBalance < 0 ? "text-rose-600" : "text-emerald-700"}`}>
          {fmtNative(newBalance, account.currency, true)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{fmtNative(account.balance, account.currency, true)}</span>
        <span>{type === "withdrawal" ? "\u2212" : "+"}</span>
        <span className={TXN_META[type].color}>{fmtNative(parsed, account.currency, true)}</span>
        <span>=</span>
        <span className="font-semibold">{fmtNative(newBalance, account.currency, true)}</span>
      </div>
    </div>
  );
}

export function AddTxnModal({ account, onClose, onSave }: AddTxnModalProps) {
  const { fmtNative } = useCurrency();
  const [type, setType] = useState<TxnType>("deposit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const parsed = parseFloat(amount) || 0;

  function handleSave(): void {
    if (!amount || isNaN(parsed) || parsed <= 0) { setError("Enter a valid amount"); return; }
    if (type === "withdrawal" && parsed > account.balance) { setError("Amount exceeds account balance"); return; }
    onSave({ accountId: account.id, type, amount: parsed, date, note });
    onClose();
  }

  return (
    <Modal
      title="Add Transaction"
      subtitle={`${account.emoji} ${account.name}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel="Record Transaction"
        />
      }
    >
      <FormField label="Transaction Type">
        <TxnTypeSelector
          types={TXN_TYPE_LIST}
          value={type}
          onChange={(t) => { setType(t as TxnType); setError(""); }}
        />
      </FormField>
      <FormField label={`Amount (${account.currency})`} error={error}>
        <CurrencyInput
          currency={account.currency}
          value={amount}
          onChange={(v) => { setAmount(v); setError(""); }}
          error={Boolean(error)}
        />
      </FormField>
      <DateNoteRow
        date={date}
        note={note}
        onDateChange={setDate}
        onNoteChange={setNote}
        notePlaceholder="e.g. Monthly transfer, Quarterly interest..."
      />
      {parsed > 0 && (
        <BalancePreview type={type} parsed={parsed} account={account} fmtNative={fmtNative} />
      )}
    </Modal>
  );
}
