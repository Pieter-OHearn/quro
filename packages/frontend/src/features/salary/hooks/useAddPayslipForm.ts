import { useState } from 'react';
import type { Payslip } from '@quro/shared';
import type { PayslipFieldErrorMap, PayslipFormState } from '../types';
import {
  computePayslipDraftAmounts,
  createEmptyPayslipForm,
  validatePayslipForm,
} from '../utils/payslip-form';

type UseAddPayslipFormArgs = {
  onSave: (payslip: Omit<Payslip, 'id'>) => void;
  onClose: () => void;
  baseCurrency: string;
};

export function useAddPayslipForm({ onSave, onClose, baseCurrency }: UseAddPayslipFormArgs) {
  const [form, setForm] = useState<PayslipFormState>(createEmptyPayslipForm);
  const [errors, setErrors] = useState<PayslipFieldErrorMap>({});
  const { gross, tax, pension, bonus, net } = computePayslipDraftAmounts(form);

  const set = (field: keyof PayslipFormState, value: string) => {
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
      currency: baseCurrency as Payslip['currency'],
    });
    onClose();
  };

  return { form, errors, set, gross, tax, pension, bonus, net, handleSave };
}
