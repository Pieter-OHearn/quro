import type {
  Mortgage as MortgageType,
  MortgageRateType,
  MortgageRepaymentType,
  MortgageTransaction,
  Property,
  PropertyTransaction,
} from '@quro/shared';
import type { CurrencyCode } from '@/lib/CurrencyContext';
import type { FailedRouteQuery } from '@/lib/routeQueryErrors';

export type MortgageFormatFn = (n: number) => string;

export type { MortgageTransactionType as MortgageTxnType } from '@quro/shared';

export type SaveMortgageTxnInput = Omit<MortgageTransaction, 'id'> & { id?: number };

/** The fields a mortgage reads from its linked property; the API never takes them. */
type LinkedPropertyField = 'linkedPropertyId' | 'propertyAddress' | 'propertyValue';

export type CreateMortgagePayload = Omit<MortgageType, 'id' | LinkedPropertyField> & {
  linkedPropertyId: number;
};

export type UpdateMortgagePayload = Partial<Omit<MortgageType, 'id' | LinkedPropertyField>> & {
  id: number;
  linkedPropertyId?: number;
};

export type MortgageFormPayload = (CreateMortgagePayload | UpdateMortgagePayload) & { id?: number };

export type MortgageFormState = {
  linkedPropertyId: string;
  /** Shown from the linked property; never sent. */
  propertyAddress: string;
  lender: string;
  currency: CurrencyCode;
  originalAmount: string;
  outstandingBalance: string;
  /** Shown from the linked property, for the loan-to-value preview; never sent. */
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
  /** The linked property's ledger; the page shows its valuations read-only. */
  propertyTxns: PropertyTransaction[];
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
