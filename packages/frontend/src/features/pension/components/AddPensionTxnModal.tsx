import { Modal, ModalFooter } from '@/components/ui/Modal';
import { FormField, CurrencyInput } from '@/components/ui/FormField';
import { TxnTypeSelector } from '@/components/ui/TxnTypeSelector';
import { DateNoteRow } from '@/components/ui/DateNoteRow';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { PENSION_TXN_META } from '../constants';
import { useAddPensionTxnForm } from '../hooks';
import type {
  AnnualStatementDirection,
  PensionTxnType,
  SavePensionTransactionInput,
} from '../types';

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
        type="button"
        onClick={() => setIsEmployer(true)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${isEmployer ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Employer
      </button>
      <button
        type="button"
        onClick={() => setIsEmployer(false)}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${!isEmployer ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Employee
      </button>
    </div>
  );
}

function AnnualStatementDirectionToggle({
  direction,
  onChange,
}: Readonly<{
  direction: AnnualStatementDirection;
  onChange: (value: AnnualStatementDirection) => void;
}>) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange('gain')}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${direction === 'gain' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Gain
      </button>
      <button
        type="button"
        onClick={() => onChange('loss')}
        className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${direction === 'loss' ? 'bg-rose-50 border-rose-300 text-rose-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
      >
        Loss
      </button>
    </div>
  );
}

function PdfUploadStub() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <button
        type="button"
        disabled
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-400 cursor-not-allowed"
      >
        Attach PDF (Coming soon)
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
      ? `Contribution Amount (${pot.currency})`
      : form.type === 'fee'
        ? `Fee Amount (${pot.currency})`
        : `Statement Amount (${pot.currency})`;

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
      {form.type === 'annual_statement' && (
        <FormField label="Statement Result">
          <AnnualStatementDirectionToggle
            direction={form.annualStatementDirection}
            onChange={form.setAnnualStatementDirection}
          />
        </FormField>
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
      {form.type === 'contribution' && (
        <FormField label={`Tax Amount (${pot.currency})`}>
          <CurrencyInput
            currency={pot.currency}
            value={form.taxAmount}
            onChange={(value) => {
              form.setTaxAmount(value);
              form.setError('');
            }}
          />
        </FormField>
      )}
      <DateNoteRow
        date={form.date}
        note={form.note}
        onDateChange={form.setDate}
        onNoteChange={form.setNote}
        notePlaceholder="e.g. Monthly SG..."
      />
      {form.type === 'annual_statement' && <PdfUploadStub />}
      {form.parsedAmount > 0 && (
        <PreviewBanner
          type={form.type}
          isEmployer={form.isEmployer}
          amount={form.parsedAmount}
          taxAmount={form.parsedTaxAmount}
          annualStatementDirection={form.annualStatementDirection}
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
  taxAmount: number;
  annualStatementDirection: AnnualStatementDirection;
  currency: string;
  fmtNative: (amount: number, currency: string, compact?: boolean) => string;
};

function resolvePreviewSignedAmount(params: {
  type: PensionTxnType;
  amount: number;
  taxAmount: number;
  annualStatementDirection: AnnualStatementDirection;
}): number {
  if (params.type === 'contribution') return params.amount - params.taxAmount;
  if (params.type === 'fee') return -params.amount;
  return params.annualStatementDirection === 'gain' ? params.amount : -params.amount;
}

function resolvePreviewLabel(params: {
  type: PensionTxnType;
  isEmployer: boolean;
  annualStatementDirection: AnnualStatementDirection;
}): string {
  if (params.type === 'fee') return 'Fee deducted';
  if (params.type === 'annual_statement') {
    return params.annualStatementDirection === 'gain'
      ? 'Annual statement gain'
      : 'Annual statement loss';
  }
  return params.isEmployer ? 'Employer contribution' : 'Employee contribution';
}

function resolvePreviewTone(isDeduction: boolean): { colorClass: string; bgClass: string } {
  return isDeduction
    ? { colorClass: 'text-rose-600', bgClass: 'bg-rose-50 border-rose-100' }
    : { colorClass: 'text-emerald-700', bgClass: 'bg-emerald-50 border-emerald-100' };
}

function PreviewBanner({
  type,
  isEmployer,
  amount,
  taxAmount,
  annualStatementDirection,
  currency,
  fmtNative,
}: Readonly<PreviewBannerProps>): JSX.Element {
  const signedAmount = resolvePreviewSignedAmount({
    type,
    amount,
    taxAmount,
    annualStatementDirection,
  });
  const isDeduction = signedAmount < 0;
  const { colorClass, bgClass } = resolvePreviewTone(isDeduction);
  const label = resolvePreviewLabel({ type, isEmployer, annualStatementDirection });

  return (
    <div className={`rounded-xl p-4 border ${bgClass}`}>
      <div className="flex justify-between text-xs">
        <span className={`font-medium ${colorClass}`}>{label}</span>
        <span className={`font-bold ${colorClass}`}>
          {isDeduction ? '\u2212' : '+'}
          {fmtNative(Math.abs(signedAmount), currency, true)}
        </span>
      </div>
      {type === 'contribution' && taxAmount > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          Gross {fmtNative(amount, currency, true)} · Tax {fmtNative(taxAmount, currency, true)}
        </p>
      )}
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
