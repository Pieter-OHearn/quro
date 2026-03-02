import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { FormField, CurrencyInput } from '@/components/ui/FormField';
import { TxnTypeSelector } from '@/components/ui/TxnTypeSelector';
import { DateNoteRow } from '@/components/ui/DateNoteRow';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { PENSION_TXN_META, type PensionTxnType } from '../constants';

// ─── Types ───────────────────────────────────────────────────────────────────

type AddPensionTxnModalProps = {
  pot: PensionPot;
  onClose: () => void;
  onSave: (t: Omit<PensionTransaction, 'id'>) => void;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TXN_TYPE_OPTIONS = Object.entries(PENSION_TXN_META).map(([key, meta]) => ({
  key,
  ...meta,
}));

// ─── Sub-components ──────────────────────────────────────────────────────────

function EmployerToggle({
  isEmployer,
  setIsEmployer,
}: Readonly<{ isEmployer: boolean; setIsEmployer: (v: boolean) => void }>) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setIsEmployer(false)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${!isEmployer ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Employee
      </button>
      <button
        onClick={() => setIsEmployer(true)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${isEmployer ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Employer
      </button>
    </div>
  );
}

// ─── Form Body ────────────────────────────────────────────────────────────────

type PensionTxnFormBodyProps = {
  form: ReturnType<typeof useAddPensionTxnForm>;
  pot: PensionPot;
};

function PensionTxnFormBody({ form, pot }: PensionTxnFormBodyProps) {
  const amountLabel =
    form.type === 'contribution' ? `Amount (${pot.currency})` : `Fee Amount (${pot.currency})`;
  return (
    <>
      <FormField label="Transaction Type">
        <TxnTypeSelector<PensionTxnType>
          types={TXN_TYPE_OPTIONS}
          value={form.type}
          onChange={form.handleTypeChange}
          columns={2}
        />
      </FormField>
      {form.type === 'contribution' && (
        <EmployerToggle isEmployer={form.isEmployer} setIsEmployer={form.setIsEmployer} />
      )}
      <FormField label={amountLabel} error={form.error}>
        <CurrencyInput
          currency={pot.currency}
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
        notePlaceholder="e.g. Monthly SG..."
      />
      {form.parsedAmount > 0 && (
        <PreviewBanner
          type={form.type}
          isEmployer={form.isEmployer}
          amount={form.parsedAmount}
          currency={pot.currency}
          fmtNative={form.fmtNative}
        />
      )}
    </>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

function usePensionTxnFormState() {
  const [type, setType] = useState<PensionTxnType>('contribution');
  const [amount, setAmount] = useState('');
  const [isEmployer, setIsEmployer] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  return {
    type,
    setType,
    amount,
    setAmount,
    isEmployer,
    setIsEmployer,
    date,
    setDate,
    note,
    setNote,
    error,
    setError,
  };
}

function useAddPensionTxnForm(
  pot: PensionPot,
  onSave: AddPensionTxnModalProps['onSave'],
  onClose: () => void,
) {
  const { fmtNative } = useCurrency();
  const formState = usePensionTxnFormState();
  const { type, setType, amount, setAmount, isEmployer, setIsEmployer, setError } = formState;
  const parsedAmount = parseFloat(amount) || 0;

  function handleTypeChange(t: PensionTxnType): void {
    setType(t);
    setError('');
    setAmount('');
    setIsEmployer(false);
  }

  function handleSave(): void {
    if (parsedAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    onSave({
      potId: pot.id,
      type,
      amount: parsedAmount,
      date: formState.date,
      note: formState.note,
      isEmployer: type === 'contribution' ? isEmployer : null,
    });
    onClose();
  }

  return { fmtNative, ...formState, parsedAmount, handleTypeChange, handleSave };
}

export function AddPensionTxnModal({ pot, onClose, onSave }: AddPensionTxnModalProps): JSX.Element {
  const form = useAddPensionTxnForm(pot, onSave, onClose);
  return (
    <Modal
      title="Record Transaction"
      subtitle={`${pot.emoji} ${pot.name}`}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onConfirm={form.handleSave} confirmLabel="Record" />}
    >
      <PensionTxnFormBody form={form} pot={pot} />
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

function PreviewBanner({
  type,
  isEmployer,
  amount,
  currency,
  fmtNative,
}: PreviewBannerProps): JSX.Element {
  const isFee = type === 'fee';
  const colorClass = isFee ? 'text-rose-600' : 'text-emerald-700';
  const bgClass = isFee ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100';

  let label: string;
  if (isFee) {
    label = 'Fee deducted';
  } else if (isEmployer) {
    label = 'Employer contribution';
  } else {
    label = 'Employee contribution';
  }

  return (
    <div className={`rounded-xl p-4 border ${bgClass}`}>
      <div className="flex justify-between text-xs">
        <span className={`font-medium ${colorClass}`}>{label}</span>
        <span className={`font-bold ${colorClass}`}>
          {isFee ? '\u2212' : '+'}
          {fmtNative(amount, currency, true)}
        </span>
      </div>
    </div>
  );
}
