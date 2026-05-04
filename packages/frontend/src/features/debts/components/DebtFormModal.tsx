import { useState, type ReactNode } from 'react';
import { CURRENCY_CODES, type CurrencyCode, type Debt, type DebtType } from '@quro/shared';
import { Banknote } from 'lucide-react';
import {
  Button,
  CurrencyInput,
  DateInput,
  EmojiPickerField,
  FormField,
  Modal,
  ModalHeader,
  SelectInput,
  TextInput,
  Textarea,
} from '@/components/ui';
import { DEBT_COLORS, DEBT_TYPE_META, DEFAULT_EMOJI_BY_TYPE, EMPTY_DEBT_FORM } from '../constants';
import type { CreateDebtPayload, DebtFormState } from '../types';
import {
  getApiErrorMessage,
  toDebtFormState,
  validateDebtForm,
  type DebtFormErrors,
} from '../utils/forms';

type DebtFormModalProps = {
  debt: Debt | null;
  onClose: () => void;
  onSubmit: (payload: CreateDebtPayload, debtId?: number) => Promise<void>;
};

type DebtFormModalShellProps = {
  editing: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
};

type DebtFormChange = <K extends keyof DebtFormState>(key: K, value: DebtFormState[K]) => void;

type DebtFormFieldsProps = {
  form: DebtFormState;
  errors: DebtFormErrors;
  onChange: DebtFormChange;
};

function DebtIdentityFields({ form, errors, onChange }: Readonly<DebtFormFieldsProps>) {
  return (
    <div className="grid items-start gap-4 md:grid-cols-[max-content_minmax(0,1fr)]">
      <EmojiPickerField
        label="Icon"
        value={form.emoji}
        onChange={(emoji) => onChange('emoji', emoji)}
        error={errors.emoji}
      />
      <FormField label="Debt Name" required error={errors.name}>
        <TextInput
          value={form.name}
          onChange={(value) => onChange('name', value)}
          placeholder="e.g. Volkswagen Golf Loan"
          error={Boolean(errors.name)}
        />
      </FormField>
    </div>
  );
}

function DebtTypeFields({
  form,
  errors,
  onChange,
  onTypeChange,
}: Readonly<DebtFormFieldsProps & { onTypeChange: (value: string) => void }>) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label="Debt Type" required error={errors.type}>
        <SelectInput
          value={form.type}
          onChange={onTypeChange}
          options={Object.entries(DEBT_TYPE_META).map(([value, meta]) => ({
            value,
            label: meta.label,
          }))}
          error={Boolean(errors.type)}
        />
      </FormField>
      <FormField label="Lender / Provider" required error={errors.lender}>
        <TextInput
          value={form.lender}
          onChange={(value) => onChange('lender', value)}
          placeholder="e.g. Volkskrediet Bank"
          error={Boolean(errors.lender)}
        />
      </FormField>
    </div>
  );
}

function DebtAmountFields({ form, errors, onChange }: Readonly<DebtFormFieldsProps>) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label="Original Amount" required error={errors.originalAmount}>
        <CurrencyInput
          currency={form.currency}
          value={form.originalAmount}
          onChange={(value) => onChange('originalAmount', value)}
          error={Boolean(errors.originalAmount)}
        />
      </FormField>
      <FormField label="Remaining Balance" required error={errors.remainingBalance}>
        <CurrencyInput
          currency={form.currency}
          value={form.remainingBalance}
          onChange={(value) => onChange('remainingBalance', value)}
          error={Boolean(errors.remainingBalance)}
        />
      </FormField>
    </div>
  );
}

function DebtTermsFields({ form, errors, onChange }: Readonly<DebtFormFieldsProps>) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <FormField label="APR %" required error={errors.interestRate}>
        <TextInput
          type="number"
          step="0.01"
          min="0"
          value={form.interestRate}
          onChange={(value) => onChange('interestRate', value)}
          error={Boolean(errors.interestRate)}
        />
      </FormField>
      <FormField label="Monthly Payment" required error={errors.monthlyPayment}>
        <CurrencyInput
          currency={form.currency}
          value={form.monthlyPayment}
          onChange={(value) => onChange('monthlyPayment', value)}
          error={Boolean(errors.monthlyPayment)}
        />
      </FormField>
      <FormField label="Currency">
        <SelectInput
          value={form.currency}
          onChange={(value) => onChange('currency', value as CurrencyCode)}
          options={[...CURRENCY_CODES]}
        />
      </FormField>
    </div>
  );
}

function DebtDateFields({ form, errors, onChange }: Readonly<DebtFormFieldsProps>) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label="Start Date" required error={errors.startDate}>
        <DateInput
          value={form.startDate}
          onChange={(value) => onChange('startDate', value)}
          error={Boolean(errors.startDate)}
        />
      </FormField>
      <FormField label="End Date" hint="optional" error={errors.endDate}>
        <DateInput
          value={form.endDate}
          onChange={(value) => onChange('endDate', value)}
          error={Boolean(errors.endDate)}
        />
      </FormField>
    </div>
  );
}

function DebtColorPicker({ form, errors, onChange }: Readonly<DebtFormFieldsProps>) {
  return (
    <FormField label="Colour Tag" required error={errors.color}>
      <div className="flex flex-wrap items-center gap-2">
        {DEBT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange('color', color)}
            className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
              form.color === color ? 'border-slate-800' : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </FormField>
  );
}

function DebtNotesField({ form, errors, onChange }: Readonly<DebtFormFieldsProps>) {
  return (
    <FormField label="Notes" hint="optional" error={errors.notes}>
      <Textarea
        value={form.notes}
        onChange={(value) => onChange('notes', value)}
        rows={3}
        placeholder="e.g. Early repayment allowed with no penalty"
        error={Boolean(errors.notes)}
      />
    </FormField>
  );
}

function DebtFormModalShell({
  editing,
  submitting,
  onClose,
  onSubmit,
  children,
}: Readonly<DebtFormModalShellProps>) {
  return (
    <Modal
      title={editing ? 'Edit Debt' : 'Add New Debt'}
      subtitle="Track a liability"
      onClose={onClose}
      maxWidth="lg"
      scrollable
      header={
        <ModalHeader
          title={editing ? 'Edit Debt' : 'Add New Debt'}
          subtitle="Track a liability"
          onClose={onClose}
          scrollable
          visual={
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-200">
              <Banknote size={18} />
            </div>
          }
        />
      }
      footer={
        <>
          <Button onClick={onClose} variant="secondary" size="lg" className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            size="lg"
            loading={submitting}
            loadingLabel={editing ? 'Saving Changes...' : 'Adding Debt...'}
            className="flex-1 bg-rose-600 hover:bg-rose-700"
          >
            {editing ? 'Save Changes' : 'Add Debt'}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export function DebtFormModal({ debt, onClose, onSubmit }: Readonly<DebtFormModalProps>) {
  const [form, setForm] = useState<DebtFormState>(() =>
    debt ? toDebtFormState(debt) : { ...EMPTY_DEBT_FORM },
  );
  const [errors, setErrors] = useState<DebtFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const editing = Boolean(debt);

  const handleChange: DebtFormChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, submit: undefined }));
  };

  const handleTypeChange = (nextType: string) => {
    const debtType = nextType as DebtType;
    setForm((current) => ({
      ...current,
      type: debtType,
      emoji: editing ? current.emoji : DEFAULT_EMOJI_BY_TYPE[debtType],
    }));
    setErrors((current) => ({ ...current, type: undefined, emoji: undefined, submit: undefined }));
  };

  const submit = async () => {
    const validation = validateDebtForm(form);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(validation.payload, debt?.id);
      onClose();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit: getApiErrorMessage(error, 'Unable to save this debt right now.'),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DebtFormModalShell
      editing={editing}
      submitting={submitting}
      onClose={onClose}
      onSubmit={() => {
        void submit();
      }}
    >
      <DebtIdentityFields form={form} errors={errors} onChange={handleChange} />
      <DebtTypeFields
        form={form}
        errors={errors}
        onChange={handleChange}
        onTypeChange={handleTypeChange}
      />
      <DebtAmountFields form={form} errors={errors} onChange={handleChange} />
      <DebtTermsFields form={form} errors={errors} onChange={handleChange} />
      <DebtDateFields form={form} errors={errors} onChange={handleChange} />
      <DebtColorPicker form={form} errors={errors} onChange={handleChange} />
      <DebtNotesField form={form} errors={errors} onChange={handleChange} />
      {errors.submit ? <p className="text-sm text-rose-500">{errors.submit}</p> : null}
    </DebtFormModalShell>
  );
}
