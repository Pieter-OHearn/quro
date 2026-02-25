import { useState } from "react";
import { useCurrency } from "@/lib/CurrencyContext";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { FormField, CurrencyInput } from "@/components/ui/FormField";
import { TxnTypeSelector } from "@/components/ui/TxnTypeSelector";
import { DateNoteRow } from "@/components/ui/DateNoteRow";
import type { PensionPot, PensionTransaction } from "@quro/shared";
import { PENSION_TXN_META, type PensionTxnType } from "../constants";

// ─── Types ───────────────────────────────────────────────────────────────────

type AddPensionTxnModalProps = {
  pot: PensionPot;
  onClose: () => void;
  onSave: (t: Omit<PensionTransaction, "id">) => void;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TXN_TYPE_OPTIONS = Object.entries(PENSION_TXN_META).map(([key, meta]) => ({
  key,
  ...meta,
}));

// ─── Component ───────────────────────────────────────────────────────────────

export function AddPensionTxnModal({ pot, onClose, onSave }: AddPensionTxnModalProps): JSX.Element {
  const { fmtNative } = useCurrency();
  const [type, setType] = useState<PensionTxnType>("contribution");
  const [amount, setAmount] = useState("");
  const [isEmployer, setIsEmployer] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const parsedAmount = parseFloat(amount) || 0;

  function handleTypeChange(t: PensionTxnType): void {
    setType(t);
    setError("");
    setAmount("");
    setIsEmployer(false);
  }

  function handleSave(): void {
    if (parsedAmount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    onSave({
      potId: pot.id,
      type,
      amount: parsedAmount,
      date,
      note,
      isEmployer: type === "contribution" ? isEmployer : null,
    });
    onClose();
  }

  const amountLabel = type === "contribution"
    ? `Amount (${pot.currency})`
    : `Fee Amount (${pot.currency})`;

  return (
    <Modal
      title="Record Transaction"
      subtitle={`${pot.emoji} ${pot.name}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel="Record"
        />
      }
    >
      {/* Type selector */}
      <FormField label="Transaction Type">
        <TxnTypeSelector<PensionTxnType>
          types={TXN_TYPE_OPTIONS}
          value={type}
          onChange={handleTypeChange}
          columns={2}
        />
      </FormField>

      {/* Employer toggle for contributions */}
      {type === "contribution" && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsEmployer(false)}
            className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${!isEmployer ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-slate-200 text-slate-400 hover:bg-slate-50"}`}
          >
            Employee
          </button>
          <button
            onClick={() => setIsEmployer(true)}
            className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${isEmployer ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-400 hover:bg-slate-50"}`}
          >
            Employer
          </button>
        </div>
      )}

      {/* Amount */}
      <FormField label={amountLabel} error={error}>
        <CurrencyInput
          currency={pot.currency}
          value={amount}
          onChange={(v) => { setAmount(v); setError(""); }}
          error={!!error}
        />
      </FormField>

      {/* Date + Note */}
      <DateNoteRow
        date={date}
        note={note}
        onDateChange={setDate}
        onNoteChange={setNote}
        notePlaceholder="e.g. Monthly SG..."
      />

      {/* Preview */}
      {parsedAmount > 0 && (
        <PreviewBanner
          type={type}
          isEmployer={isEmployer}
          amount={parsedAmount}
          currency={pot.currency}
          fmtNative={fmtNative}
        />
      )}
    </Modal>
  );
}

// ─── Preview Sub-component ───────────────────────────────────────────────────

type PreviewBannerProps = {
  type: PensionTxnType;
  isEmployer: boolean;
  amount: number;
  currency: string;
  fmtNative: (amount: number, currency: string, compact?: boolean) => string;
};

function PreviewBanner({ type, isEmployer, amount, currency, fmtNative }: PreviewBannerProps): JSX.Element {
  const isFee = type === "fee";
  const colorClass = isFee ? "text-rose-600" : "text-emerald-700";
  const bgClass = isFee ? "bg-rose-50 border-rose-100" : "bg-emerald-50 border-emerald-100";

  let label: string;
  if (isFee) {
    label = "Fee deducted";
  } else if (isEmployer) {
    label = "Employer contribution";
  } else {
    label = "Employee contribution";
  }

  return (
    <div className={`rounded-xl p-4 border ${bgClass}`}>
      <div className="flex justify-between text-xs">
        <span className={`font-medium ${colorClass}`}>{label}</span>
        <span className={`font-bold ${colorClass}`}>
          {isFee ? "\u2212" : "+"}{fmtNative(amount, currency, true)}
        </span>
      </div>
    </div>
  );
}
