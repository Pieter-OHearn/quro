import { useState, type ReactNode } from 'react';
import type { Debt } from '@quro/shared';
import { TrendingDown } from 'lucide-react';
import { Button, CurrencyInput, DateInput, FormField, Modal, TextInput } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { formatAsNegative } from '@/lib/liability';
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
    <div className="flex items-center gap-3 rounded-md border border-border-default bg-surface-sunken px-3 py-2">
      <div className="flex-1">
        <p className="text-label text-fg-muted">Current Balance</p>
        <p className="text-figure-md font-numeric text-fg">
          {formatAsNegative((value) => fmtNative(value, debt.currency), debt.remainingBalance)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-label text-fg-muted">Monthly Interest</p>
        <p className="text-figure-md font-numeric text-fg">
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
    <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-sunken px-3 py-2">
      <TrendingDown size={13} className="shrink-0 text-fg-muted" aria-hidden />
      <p className="text-cell text-fg-muted">
        <span className="font-medium font-numeric text-fg">
          {fmtNative(principal, debt.currency, true)}
        </span>{' '}
        reduces your remaining balance.
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
      subtitle={`${debt.emoji} ${debt.name}`}
      onClose={onClose}
      maxWidth="sm"
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting} loadingLabel="Logging Payment...">
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
      {errors.submit ? <p className="text-cell text-danger">{errors.submit}</p> : null}
    </DebtPaymentModalShell>
  );
}
