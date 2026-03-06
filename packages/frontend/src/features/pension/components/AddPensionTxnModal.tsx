import { Modal, ModalFooter } from '@/components/ui/Modal';
import { FormField, CurrencyInput } from '@/components/ui/FormField';
import { TxnTypeSelector } from '@/components/ui/TxnTypeSelector';
import { DateNoteRow } from '@/components/ui/DateNoteRow';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { PENSION_TXN_META } from '../constants';
import { useAddPensionTxnForm } from '../hooks';
import type { PensionTxnType, SavePensionTransactionInput } from '../types';

type AddPensionTxnModalProps = {
  pot: PensionPot;
  existing?: PensionTransaction;
  onClose: () => void;
  onSave: (txn: SavePensionTransactionInput) => void;
};

const TXN_TYPE_OPTIONS = Object.entries(PENSION_TXN_META).map(([key, meta]) => ({
  key,
  ...meta,
}));

function EmployerToggle({
  isEmployer,
  setIsEmployer,
}: Readonly<{ isEmployer: boolean; setIsEmployer: (value: boolean) => void }>) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setIsEmployer(true)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${isEmployer ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Employer
      </button>
      <button
        onClick={() => setIsEmployer(false)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${!isEmployer ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Employee
      </button>
    </div>
  );
}

type PensionTxnFormBodyProps = {
  form: ReturnType<typeof useAddPensionTxnForm>;
  pot: PensionPot;
};

function PensionTxnFormBody({ form, pot }: Readonly<PensionTxnFormBodyProps>) {
  const amountLabel =
    form.type === 'contribution'
      ? `Amount (${pot.currency})`
      : `${PENSION_TXN_META[form.type].label} Amount (${pot.currency})`;

  return (
    <>
      <FormField label="Transaction Type">
        <TxnTypeSelector<PensionTxnType>
          types={TXN_TYPE_OPTIONS}
          value={form.type}
          onChange={form.handleTypeChange}
          columns={3}
        />
      </FormField>
      {form.type === 'contribution' && (
        <EmployerToggle isEmployer={form.isEmployer} setIsEmployer={form.setIsEmployer} />
      )}
      <FormField label={amountLabel} error={form.error}>
        <CurrencyInput
          currency={pot.currency}
          value={form.amount}
          onChange={(value) => {
            form.setAmount(value);
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
}: Readonly<PreviewBannerProps>): JSX.Element {
  const isDeduction = type !== 'contribution';
  const colorClass = isDeduction ? 'text-rose-600' : 'text-emerald-700';
  const bgClass = isDeduction ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100';

  let label: string;
  if (type === 'fee') {
    label = 'Fee deducted';
  } else if (type === 'tax') {
    label = 'Contributions tax deducted';
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
          {isDeduction ? '\u2212' : '+'}
          {fmtNative(amount, currency, true)}
        </span>
      </div>
    </div>
  );
}

export function AddPensionTxnModal({
  pot,
  existing,
  onClose,
  onSave,
}: AddPensionTxnModalProps): JSX.Element {
  const form = useAddPensionTxnForm(pot, existing, onSave, onClose);
  const isEditing = Boolean(existing);

  return (
    <Modal
      title={isEditing ? 'Edit Transaction' : 'Record Transaction'}
      subtitle={`${pot.emoji} ${pot.name}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={form.handleSave}
          confirmLabel={isEditing ? 'Save Changes' : 'Record'}
        />
      }
    >
      <PensionTxnFormBody form={form} pot={pot} />
    </Modal>
  );
}
