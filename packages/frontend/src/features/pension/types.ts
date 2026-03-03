import type { PensionPot, PensionTransaction } from '@quro/shared';

export type PensionTxnType = 'contribution' | 'fee';

export type PensionGrowthPoint = {
  year: string;
  value: number;
};

export type DatedPensionTransaction = PensionTransaction & {
  timestamp: number;
};

export type PensionFormatBaseFn = (n: number) => string;
export type PensionFormatNativeFn = (n: number, currency: string, compact?: boolean) => string;
export type ConvertToBaseFn = (n: number, currency: string) => number;
export type IsForeignFn = (currency: string) => boolean;

export type NumericLike = number | string | null | undefined;
export type IntegerLike = number | string | null | undefined;

export type ApiPensionPot = Omit<PensionPot, 'balance' | 'employeeMonthly' | 'employerMonthly'> & {
  balance: NumericLike;
  employeeMonthly: NumericLike;
  employerMonthly: NumericLike;
};

export type ApiPensionTransaction = Omit<PensionTransaction, 'amount'> & {
  amount: NumericLike;
};

export type DeletePotMutation = {
  mutate: (id: number) => void;
};

export type PensionPageState = {
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  convertToBase: ConvertToBaseFn;
  isForeign: IsForeignFn;
  baseCurrency: string;
  pensions: PensionPot[];
  pensionTxns: PensionTransaction[];
  isLoading: boolean;
  showModal: boolean;
  setShowModal: (value: boolean) => void;
  editing: PensionPot | undefined;
  setEditing: (value: PensionPot | undefined) => void;
  expanded: number | null;
  setExpanded: (value: number | null) => void;
  addTxnForPot: PensionPot | null;
  setAddTxnForPot: (value: PensionPot | null) => void;
  totalInBase: number;
  totalMonthlyContribInBase: number;
  projected: number | null;
  monthlyDrawdown: number | null;
  yearsToRetirement: number | null;
  retirementYearsInput: string;
  setRetirementYearsInput: (value: string) => void;
  pensionGrowthData: PensionGrowthPoint[];
  pensionGrowthPct: number | null;
  handleSave: (pot: PensionPot | Omit<PensionPot, 'id'>) => void;
  handleAddPensionTxn: (txn: Omit<PensionTransaction, 'id'>) => void;
  handleDeletePensionTxn: (id: number) => void;
  deletePot: DeletePotMutation;
};
