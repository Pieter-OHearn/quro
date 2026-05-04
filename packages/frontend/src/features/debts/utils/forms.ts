import type { Debt } from '@quro/shared';
import type {
  CreateDebtPayload,
  CreateDebtPaymentPayload,
  DebtFormState,
  DebtPaymentFormState,
} from '../types';
import { estimateDebtMonthlyInterest } from './debt-metrics';

export type DebtFormErrors = Partial<Record<keyof DebtFormState, string>> & {
  submit?: string;
};

export type DebtPaymentErrors = Partial<Record<keyof DebtPaymentFormState, string>> & {
  submit?: string;
};

type DebtAmountValues = {
  originalAmount: number | null;
  remainingBalance: number | null;
  interestRate: number | null;
  monthlyPayment: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getApiErrorValue(error: unknown): unknown {
  if (!isRecord(error) || !isRecord(error.response)) return null;
  if (!isRecord(error.response.data)) return null;
  return error.response.data.error;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  const apiError = getApiErrorValue(error);
  if (typeof apiError === 'string') return apiError;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function formatShortDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function formatLocalDateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDebtAmountValues(form: DebtFormState): DebtAmountValues {
  return {
    originalAmount: parseAmount(form.originalAmount),
    remainingBalance: parseAmount(form.remainingBalance),
    interestRate: parseAmount(form.interestRate),
    monthlyPayment: parseAmount(form.monthlyPayment),
  };
}

function getOriginalAmountError(value: number | null): string | null {
  return value == null || value <= 0 ? 'Enter an original amount above 0.' : null;
}

function getRemainingBalanceError(values: DebtAmountValues): string | null {
  if (values.remainingBalance == null || values.remainingBalance < 0) {
    return 'Enter a remaining balance of 0 or more.';
  }
  if (
    values.originalAmount != null &&
    values.remainingBalance != null &&
    values.remainingBalance > values.originalAmount
  ) {
    return 'Remaining balance cannot exceed the original amount.';
  }
  return null;
}

function getMinimumZeroError(value: number | null, message: string): string | null {
  return value == null || value < 0 ? message : null;
}

function validateDebtAmounts(values: DebtAmountValues): DebtFormErrors {
  const errors: DebtFormErrors = {};
  const originalAmountError = getOriginalAmountError(values.originalAmount);
  const remainingBalanceError = getRemainingBalanceError(values);
  const interestRateError = getMinimumZeroError(values.interestRate, 'Enter an APR of 0 or more.');
  const monthlyPaymentError = getMinimumZeroError(
    values.monthlyPayment,
    'Enter a monthly payment of 0 or more.',
  );

  if (originalAmountError) errors.originalAmount = originalAmountError;
  if (remainingBalanceError) errors.remainingBalance = remainingBalanceError;
  if (interestRateError) errors.interestRate = interestRateError;
  if (monthlyPaymentError) errors.monthlyPayment = monthlyPaymentError;

  return errors;
}

function validateDebtTextFields(form: DebtFormState): DebtFormErrors {
  const errors: DebtFormErrors = {};

  if (!form.name.trim()) errors.name = 'Debt name is required.';
  if (!form.lender.trim()) errors.lender = 'Lender is required.';
  if (!form.startDate) errors.startDate = 'Start date is required.';
  if (form.endDate && form.endDate < form.startDate) {
    errors.endDate = 'End date cannot be earlier than the start date.';
  }
  if (!form.emoji.trim()) errors.emoji = 'Choose an emoji.';
  if (!form.color.trim()) errors.color = 'Choose a colour.';

  return errors;
}

function buildDebtPayload(form: DebtFormState, values: DebtAmountValues): CreateDebtPayload {
  return {
    name: form.name.trim(),
    type: form.type,
    lender: form.lender.trim(),
    originalAmount: values.originalAmount ?? 0,
    remainingBalance: values.remainingBalance ?? 0,
    currency: form.currency,
    interestRate: values.interestRate ?? 0,
    monthlyPayment: values.monthlyPayment ?? 0,
    startDate: form.startDate,
    endDate: form.endDate || null,
    color: form.color,
    emoji: form.emoji.trim(),
    notes: form.notes.trim() ? form.notes.trim() : null,
  };
}

export function toDebtFormState(debt: Debt): DebtFormState {
  return {
    name: debt.name,
    type: debt.type,
    lender: debt.lender,
    originalAmount: String(debt.originalAmount),
    remainingBalance: String(debt.remainingBalance),
    currency: debt.currency,
    interestRate: String(debt.interestRate),
    monthlyPayment: String(debt.monthlyPayment),
    startDate: debt.startDate,
    endDate: debt.endDate ?? '',
    color: debt.color,
    emoji: debt.emoji,
    notes: debt.notes ?? '',
  };
}

export function validateDebtForm(form: DebtFormState) {
  const values = parseDebtAmountValues(form);
  const errors = {
    ...validateDebtAmounts(values),
    ...validateDebtTextFields(form),
  };

  if (Object.keys(errors).length > 0) return { ok: false as const, errors };
  return { ok: true as const, payload: buildDebtPayload(form, values) };
}

export function buildInitialPaymentForm(debt: Debt): DebtPaymentFormState {
  const estimatedInterest = estimateDebtMonthlyInterest(debt);
  const amount = Math.max(debt.monthlyPayment, estimatedInterest);

  return {
    date: formatLocalDateOnly(),
    amount: amount > 0 ? amount.toFixed(2) : '',
    interest: estimatedInterest > 0 ? estimatedInterest.toFixed(2) : '0',
    note: 'Monthly payment',
  };
}

function validatePaymentAmounts(
  amount: number | null,
  interest: number | null,
  principal: number,
  remainingBalance: number,
): DebtPaymentErrors {
  const errors: DebtPaymentErrors = {};

  if (amount == null || amount <= 0) errors.amount = 'Enter a payment amount above 0.';
  if (interest == null || interest < 0) errors.interest = 'Interest must be 0 or more.';
  if (amount != null && interest != null && interest > amount) {
    errors.interest = 'Interest cannot exceed the total payment.';
  }
  if (principal > remainingBalance) {
    errors.amount = 'This payment would reduce more principal than the remaining balance.';
  }

  return errors;
}

function calculatePrincipal(amount: number | null, interest: number | null) {
  return amount != null && interest != null ? Number.parseFloat((amount - interest).toFixed(2)) : 0;
}

export function validateDebtPaymentForm(form: DebtPaymentFormState, debt: Debt) {
  const amount = parseAmount(form.amount);
  const interest = parseAmount(form.interest);
  const principal = calculatePrincipal(amount, interest);
  const errors = validatePaymentAmounts(amount, interest, principal, debt.remainingBalance);

  if (!form.date) errors.date = 'Payment date is required.';
  if (Object.keys(errors).length > 0) return { ok: false as const, errors };

  return {
    ok: true as const,
    payload: {
      debtId: debt.id,
      date: form.date,
      amount: amount ?? 0,
      interest: interest ?? 0,
      note: form.note.trim(),
    } satisfies CreateDebtPaymentPayload,
    principal,
  };
}
