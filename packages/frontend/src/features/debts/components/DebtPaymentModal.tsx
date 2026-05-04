import { useState, type ReactNode } from 'react';
import type { Debt } from '@quro/shared';
import { TrendingDown } from 'lucide-react';
import {
  Button,
  CurrencyInput,
  DateInput,
  FormField,
  Modal,
  ModalHeader,
  TextInput,
} from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import type { CreateDebtPaymentPayload, DebtPaymentFormState } from '../types';
import { estimateDebtMonthlyInterest } from '../utils/debt-metrics';
import {
  buildInitialPaymentForm,
  getApiErrorMessage,
  validateDebtPaymentForm,
  type DebtPaymentErrors,
} from '../utils/forms';

type DebtPaymentModalProps = {
  debt: Debt;
  onClose: () => void;
  onSubmit: (payload: CreateDebtPaymentPayload) => Promise<void>;
};

type DebtPaymentModalShellProps = {
  debt: Debt;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
};

type DebtPaymentChange = <K extends keyof DebtPaymentFormState>(
  key: K,
  value: DebtPaymentFormState[K],
) => void;

function DebtPaymentSummary({ debt }: Readonly<{ debt: Debt }>) {
  const { fmtNative } = useCurrency();
  const monthlyInterest = estimateDebtMonthlyInterest(debt);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-wide text-slate-400">Current Balance</p>
        <p className="text-sm font-bold text-slate-800">
          {fmtNative(debt.remainingBalance, debt.currency)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[10px] uppercase tracking-wide text-slate-400">Monthly Interest</p>
        <p className="text-sm font-semibold text-rose-500">
          {fmtNative(monthlyInterest, debt.currency, true)}
        </p>
      </div>
    </div>
  );
}

function DebtPaymentAmountFields({
  debt,
  form,
  errors,
  onChange,
}: Readonly<{
  debt: Debt;
  form: DebtPaymentFormState;
  errors: DebtPaymentErrors;
  onChange: DebtPaymentChange;
}>) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label="Total Payment" required error={errors.amount}>
        <CurrencyInput
          currency={debt.currency}
          value={form.amount}
          onChange={(value) => onChange('amount', value)}
          error={Boolean(errors.amount)}
        />
      </FormField>
      <FormField label="Interest Portion" required error={errors.interest}>
        <CurrencyInput
          currency={debt.currency}
          value={form.interest}
          onChange={(value) => onChange('interest', value)}
          error={Boolean(errors.interest)}
        />
      </FormField>
    </div>
  );
}

function PrincipalPreview({ debt, principal }: Readonly<{ debt: Debt; principal: number }>) {
  const { fmtNative } = useCurrency();

  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
      <TrendingDown size={13} className="flex-shrink-0 text-emerald-500" />
      <p className="text-xs text-emerald-700">
        <span className="font-semibold">{fmtNative(principal, debt.currency, true)}</span> reduces
        your remaining balance.
      </p>
    </div>
  );
}

function DebtPaymentModalShell({
  debt,
  submitting,
  onClose,
  onSubmit,
  children,
}: Readonly<DebtPaymentModalShellProps>) {
  return (
    <Modal
      title="Log Payment"
      subtitle={debt.name}
      onClose={onClose}
      maxWidth="sm"
      header={
        <ModalHeader
          title="Log Payment"
          subtitle={debt.name}
          onClose={onClose}
          visual={<div className="mb-3 text-3xl">{debt.emoji}</div>}
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
            loadingLabel="Logging Payment..."
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          >
            Log Payment
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export function DebtPaymentModal({ debt, onClose, onSubmit }: Readonly<DebtPaymentModalProps>) {
  const [form, setForm] = useState<DebtPaymentFormState>(() => buildInitialPaymentForm(debt));
  const [errors, setErrors] = useState<DebtPaymentErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const validation = validateDebtPaymentForm(form, debt);
  const principalPreview = validation.ok ? validation.principal : 0;

  const handleChange: DebtPaymentChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, submit: undefined }));
  };

  const submit = async () => {
    const nextValidation = validateDebtPaymentForm(form, debt);
    if (!nextValidation.ok) {
      setErrors(nextValidation.errors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(nextValidation.payload);
      onClose();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit: getApiErrorMessage(error, 'Unable to log this payment right now.'),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DebtPaymentModalShell
      debt={debt}
      submitting={submitting}
      onClose={onClose}
      onSubmit={() => {
        void submit();
      }}
    >
      <DebtPaymentSummary debt={debt} />
      <FormField label="Date" required error={errors.date}>
        <DateInput
          value={form.date}
          onChange={(value) => handleChange('date', value)}
          error={Boolean(errors.date)}
        />
      </FormField>
      <DebtPaymentAmountFields debt={debt} form={form} errors={errors} onChange={handleChange} />
      <PrincipalPreview debt={debt} principal={principalPreview} />
      <FormField label="Note">
        <TextInput
          value={form.note}
          onChange={(value) => handleChange('note', value)}
          placeholder="e.g. Extra repayment"
        />
      </FormField>
      {errors.submit ? <p className="text-sm text-rose-500">{errors.submit}</p> : null}
    </DebtPaymentModalShell>
  );
}
