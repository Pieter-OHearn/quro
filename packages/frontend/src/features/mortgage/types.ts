import type { CurrencyCode } from '@/lib/CurrencyContext';
import type { Mortgage as MortgageType, MortgageTransaction, Property } from '@quro/shared';

export type MortgageFormatFn = (n: number) => string;

export type MortgageTxnType = 'repayment' | 'valuation' | 'rate_change';
export type MortgageTxnFilter = MortgageTxnType | 'all';

export type CreateMortgagePayload = Omit<MortgageType, 'id'> & {
  linkedPropertyId: number;
};

export type UpdateMortgagePayload = Partial<Omit<MortgageType, 'id'>> & {
  id: number;
  linkedPropertyId?: number;
};

export type MortgageFormPayload = (CreateMortgagePayload | UpdateMortgagePayload) & { id?: number };

export type MortgageFormState = {
  linkedPropertyId: string;
  propertyAddress: string;
  lender: string;
  currency: CurrencyCode;
  originalAmount: string;
  outstandingBalance: string;
  propertyValue: string;
  monthlyPayment: string;
  interestRate: string;
  rateType: string;
  fixedUntil: string;
  termYears: string;
  startDate: string;
  endDate: string;
  overpaymentLimit: string;
};

export type AmortizationRow = {
  year: string;
  balance: number;
  principal: number;
  interest: number;
};

export type PaymentBreakdownRow = {
  month: string;
  principal: number;
  interest: number;
};

export type OverpaymentImpact = {
  annualAllowance: number;
  extraMonthly: number;
  interestSaved: number;
  monthsReduced: number;
};

export type MortgagePageState = {
  fmt: MortgageFormatFn;
  mortgages: MortgageType[];
  properties: Property[];
  mortgage: MortgageType | undefined;
  txns: MortgageTransaction[];
  showTxnModal: boolean;
  setShowTxnModal: (v: boolean) => void;
  showMortgageModal: boolean;
  setShowMortgageModal: (v: boolean) => void;
  editingMortgage: MortgageType | null;
  setEditingMortgage: (v: MortgageType | null) => void;
  editingLinkedPropertyId: number | null;
  setActiveMortgageId: (id: number | null) => void;
  handleAddTxn: (transaction: Omit<MortgageTransaction, 'id'>) => void;
  handleSaveMortgage: (payload: MortgageFormPayload) => Promise<void>;
  handleDeleteTxn: (id: number) => void;
  closeMortgageModal: () => void;
  isLoading: boolean;
};
