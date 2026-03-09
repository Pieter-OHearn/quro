import { useState } from 'react';
import type { CurrencyCode, Payslip } from '@quro/shared';
import type { PayslipFieldErrorMap, PayslipFormState, SavePayslipInput } from '../types';
import {
  computePayslipDraftAmounts,
  createPayslipFormFromExisting,
  createEmptyPayslipForm,
  validatePayslipForm,
} from '../utils/payslip-form';

export function useAddPayslipForm(baseCurrency: CurrencyCode, existing?: Payslip) {
  const [form, setForm] = useState<PayslipFormState>(() =>
    existing ? createPayslipFormFromExisting(existing) : createEmptyPayslipForm(baseCurrency),
  );
  const [errors, setErrors] = useState<PayslipFieldErrorMap>({});
  const { gross, tax, pension, bonus, net } = computePayslipDraftAmounts(form);

  const set = <K extends keyof PayslipFormState>(field: K, value: PayslipFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  };

  const buildPayload = (): SavePayslipInput | null => {
    const nextErrors = validatePayslipForm(form, gross, tax, pension);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return null;
    }

    return {
      month: form.month.trim(),
      date: form.date.trim(),
      gross,
      tax,
      pension,
      net,
      bonus: bonus > 0 ? bonus : null,
      currency: form.currency,
    };
  };

  return { form, errors, set, gross, tax, pension, bonus, net, buildPayload };
}
