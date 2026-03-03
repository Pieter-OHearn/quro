import type { PayslipFieldErrorMap, PayslipFormState } from '../types';

const isInvalidAmount = (raw: string, parsed: number, allowZero: boolean) =>
  !raw || Number.isNaN(parsed) || (allowZero ? parsed < 0 : parsed <= 0);

export const createEmptyPayslipForm = (): PayslipFormState => ({
  month: '',
  date: '',
  gross: '',
  tax: '',
  pension: '',
  bonus: '',
});

export const computePayslipDraftAmounts = (form: PayslipFormState) => {
  const gross = Number.parseFloat(form.gross) || 0;
  const tax = Number.parseFloat(form.tax) || 0;
  const pension = Number.parseFloat(form.pension) || 0;
  const bonus = Number.parseFloat(form.bonus) || 0;
  const net = gross + bonus - tax - pension;

  return { gross, tax, pension, bonus, net };
};

export function validatePayslipForm(
  form: PayslipFormState,
  gross: number,
  tax: number,
  pension: number,
): PayslipFieldErrorMap {
  const errors: PayslipFieldErrorMap = {};

  if (!form.month.trim()) errors.month = 'Required';
  if (!form.date.trim()) errors.date = 'Required';
  if (isInvalidAmount(form.gross, gross, false)) errors.gross = 'Enter a valid amount';
  if (isInvalidAmount(form.tax, tax, true)) errors.tax = 'Enter a valid amount';
  if (isInvalidAmount(form.pension, pension, true)) errors.pension = 'Enter a valid amount';

  return errors;
}
