import type { Debt, DebtPayment, DebtType } from '@quro/shared';
import type { CurrencyCode } from '@/lib/CurrencyContext';

export type DebtFilterValue = DebtType | 'all';

export type CreateDebtPayload = Omit<Debt, 'id'>;

export type UpdateDebtPayload = Partial<Omit<Debt, 'id'>> & {
  id: number;
};

export type CreateDebtPaymentPayload = Pick<
  DebtPayment,
  'debtId' | 'date' | 'amount' | 'interest' | 'note'
>;

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
