import type { CurrencyCode } from '@/lib/CurrencyContext';
import type { FailedRouteQuery } from '@/lib/routeQueryErrors';
import type {
  Mortgage as MortgageType,
  MortgageRateType,
  MortgageRepaymentType,
  MortgageTransaction,
  Property,
} from '@quro/shared';

export type MortgageFormatFn = (n: number) => string;

export type MortgageTxnType = 'repayment' | 'valuation' | 'rate_change';
export type MortgageTxnFilter = MortgageTxnType | 'all';

export type SaveMortgageTxnInput = Omit<MortgageTransaction, 'id'> & { id?: number };

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
  rateType: MortgageRateType;
  repaymentType: MortgageRepaymentType;
  fixedUntil: string;
  termYears: string;
  startDate: string;
  endDate: string;
  overpaymentLimit: string;
  isJoint: boolean;
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

export type MortgagePageState = {
  fmt: MortgageFormatFn;
  mortgages: MortgageType[];
  properties: Property[];
  mortgage: MortgageType | undefined;
  txns: MortgageTransaction[];
  showTxnModal: boolean;
  setShowTxnModal: (v: boolean) => void;
  editingTxn: MortgageTransaction | null;
  setEditingTxn: (v: MortgageTransaction | null) => void;
  closeTxnModal: () => void;
  showMortgageModal: boolean;
  setShowMortgageModal: (v: boolean) => void;
  editingMortgage: MortgageType | null;
  setEditingMortgage: (v: MortgageType | null) => void;
  editingLinkedPropertyId: number | null;
  setActiveMortgageId: (id: number | null) => void;
  handleAddTxn: (transaction: SaveMortgageTxnInput) => void;
  handleSaveMortgage: (payload: MortgageFormPayload) => Promise<void>;
  handleDeleteTxn: (id: number) => void;
  handleDeleteMortgage: (id: number, mode?: 'preserveTransactions' | 'deleteTransactions') => void;
  closeMortgageModal: () => void;
  isLoading: boolean;
  queryFailures: FailedRouteQuery[];
};
