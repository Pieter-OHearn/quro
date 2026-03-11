import { isCurrencyCode, type CurrencyCode, type Payslip } from '@quro/shared';
import { formatFixedInputValue } from '@/lib/utils';
import type { PayslipFieldErrorMap, PayslipFormState } from '../types';

const isInvalidRequiredNumber = (raw: string, parsed: number) => !raw || Number.isNaN(parsed);

export const createEmptyPayslipForm = (currency: CurrencyCode): PayslipFormState => ({
  month: '',
  date: '',
  gross: '',
  tax: '',
  pension: '',
  bonus: '',
  currency,
});

export const createPayslipFormFromExisting = (payslip: Payslip): PayslipFormState => ({
  month: payslip.month,
  date: payslip.date,
  gross: formatFixedInputValue(payslip.gross),
  tax: formatFixedInputValue(payslip.tax),
  pension: formatFixedInputValue(payslip.pension),
  bonus: payslip.bonus != null ? formatFixedInputValue(payslip.bonus) : '',
  currency: payslip.currency,
});

export const computePayslipDraftAmounts = (form: PayslipFormState) => {
  const gross = Number.parseFloat(form.gross) || 0;
  const tax = Number.parseFloat(form.tax) || 0;
  const pension = Number.parseFloat(form.pension) || 0;
  const bonus = Number.parseFloat(form.bonus) || 0;
  const net = gross + bonus - tax - pension;

  return { gross, tax, pension, bonus, net };
};

export function validatePayslipForm(form: PayslipFormState): PayslipFieldErrorMap {
  const { gross, tax, pension } = computePayslipDraftAmounts(form);
  const errors: PayslipFieldErrorMap = {};

  if (!form.month.trim()) errors.month = 'Required';
  if (!form.date.trim()) errors.date = 'Required';
  if (isInvalidRequiredNumber(form.gross, gross) || gross <= 0) {
    errors.gross = 'Enter a valid amount';
  }
  if (isInvalidRequiredNumber(form.tax, tax)) errors.tax = 'Enter a valid amount';
  if (isInvalidRequiredNumber(form.pension, pension)) errors.pension = 'Enter a valid amount';
  if (!isCurrencyCode(form.currency)) errors.currency = 'Select a currency';

  return errors;
}
