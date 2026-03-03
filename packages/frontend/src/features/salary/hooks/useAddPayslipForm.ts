import { useState } from 'react';
import type { CurrencyCode, Payslip } from '@quro/shared';
import type { PayslipFieldErrorMap, PayslipFormState } from '../types';
import {
  computePayslipDraftAmounts,
  createEmptyPayslipForm,
  validatePayslipForm,
} from '../utils/payslip-form';

type UseAddPayslipFormArgs = {
  onSave: (payslip: Omit<Payslip, 'id'>) => void;
  onClose: () => void;
  baseCurrency: CurrencyCode;
};

export function useAddPayslipForm({ onSave, onClose, baseCurrency }: UseAddPayslipFormArgs) {
  const [form, setForm] = useState<PayslipFormState>(() => createEmptyPayslipForm(baseCurrency));
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

  const handleSave = () => {
    const nextErrors = validatePayslipForm(form, gross, tax, pension);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onSave({
      month: form.month.trim(),
      date: form.date.trim(),
      gross,
      tax,
      pension,
      net,
      bonus: bonus > 0 ? bonus : null,
      currency: form.currency,
    });
    onClose();
  };

  return { form, errors, set, gross, tax, pension, bonus, net, handleSave };
}
