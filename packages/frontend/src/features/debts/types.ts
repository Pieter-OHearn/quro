import { type DebtPayload, type DebtPaymentPayload, type Debt, type DebtType } from '@quro/shared';
import type { CurrencyCode } from '@/lib/CurrencyContext';

export type DebtFilterValue = DebtType | 'all';

export type CreateDebtPayload = DebtPayload;

export type UpdateDebtPayload = Partial<Omit<Debt, 'id'>> & {
  id: number;
};

export type CreateDebtPaymentPayload = Omit<DebtPaymentPayload, 'principal'>;

export type DebtFormState = {
  name: string;
  type: DebtType;
  lender: string;
  originalAmount: string;
  remainingBalance: string;
  currency: CurrencyCode;
  interestRate: string;
  monthlyPayment: string;
  startDate: string;
  endDate: string;
  color: string;
  emoji: string;
  notes: string;
};

export type DebtPaymentFormState = {
  date: string;
  amount: string;
  interest: string;
  note: string;
};
