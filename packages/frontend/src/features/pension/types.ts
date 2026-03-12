import type {
  AppCapabilityStatus,
  PensionImportCollisionWarning,
  PensionImportConfidenceLabel,
  PensionPot,
  PensionStatementDocument,
  PensionStatementImportFeedItem,
  PensionStatementImport,
  PensionStatementImportSummary,
  PensionStatementImportRow,
  PensionTransaction,
} from '@quro/shared';
import type { FailedRouteQuery } from '@/lib/routeQueryErrors';
import type { ApiPdfDocument } from '@/lib/pdfDocuments';

export type PensionTxnType = 'contribution' | 'fee' | 'annual_statement';
export type AnnualStatementDirection = 'gain' | 'loss';

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

export type ApiPensionPot = Omit<
  PensionPot,
  'balance' | 'employeeMonthly' | 'employerMonthly' | 'metadata'
> & {
  balance: NumericLike;
  employeeMonthly: NumericLike;
  employerMonthly: NumericLike;
  metadata?: unknown;
};

export type ApiPensionTransaction = Omit<PensionTransaction, 'amount' | 'taxAmount'> & {
  amount: NumericLike;
  taxAmount: NumericLike;
};

export type ApiPensionStatementDocument = Omit<PensionStatementDocument, 'sizeBytes' | 'mimeType'> &
  ApiPdfDocument;

export type ApiPensionStatementImport = Omit<
  PensionStatementImport,
  'sizeBytes' | 'totalRows' | 'deletedRows' | 'activeRows'
> & {
  sizeBytes: NumericLike;
  totalRows?: NumericLike;
  deletedRows?: NumericLike;
  activeRows?: NumericLike;
};

export type ApiPensionStatementImportFeedItem = Omit<PensionStatementImportFeedItem, 'import'> & {
  import: ApiPensionStatementImport;
  pot: {
    id: IntegerLike;
    name: string;
    provider: string;
    emoji: string | null;
  };
};

export type ApiPensionStatementImportSummary = Omit<
  PensionStatementImportSummary,
  'totalRows' | 'deletedRows' | 'activeRows'
> & {
  totalRows?: NumericLike;
  deletedRows?: NumericLike;
  activeRows?: NumericLike;
};

export type ApiPensionStatementImportRow = Omit<
  PensionStatementImportRow,
  'amount' | 'taxAmount' | 'confidence' | 'collisionWarning'
> & {
  amount: NumericLike;
  taxAmount: NumericLike;
  confidence: NumericLike;
  collisionWarning?: PensionImportCollisionWarning | null;
  confidenceLabel: PensionImportConfidenceLabel;
  type: PensionTransaction['type'];
  evidence: Array<{ page: number | null; snippet: string }>;
};

export type UpdatePensionImportRowPayload = Partial<
  Pick<PensionStatementImportRow, 'type' | 'amount' | 'taxAmount' | 'date' | 'note' | 'isEmployer'>
>;

export type DeletePotMutation = {
  mutate: (id: number) => void;
};

export type SavePensionTransactionInput = Omit<PensionTransaction, 'id'> & { id?: number };
export type SavePensionTransactionResult = PensionTransaction;

export type PensionPageState = {
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  convertToBase: ConvertToBaseFn;
  isForeign: IsForeignFn;
  baseCurrency: string;
  pensions: PensionPot[];
  pensionTxns: PensionTransaction[];
  documentsByTransactionId: Map<number, PensionStatementDocument>;
  pensionImportCapability: AppCapabilityStatus;
  isLoading: boolean;
  queryFailures: FailedRouteQuery[];
  showModal: boolean;
  setShowModal: (value: boolean) => void;
  editing: PensionPot | undefined;
  setEditing: (value: PensionPot | undefined) => void;
  expanded: number | null;
  setExpanded: (value: number | null) => void;
  addTxnForPot: PensionPot | null;
  setAddTxnForPot: (value: PensionPot | null) => void;
  importModal: {
    pot: PensionPot;
    importId: number | null;
  } | null;
  openImportModal: (pot: PensionPot, importId?: number | null) => void;
  closeImportModal: () => void;
  editingTxn: PensionTransaction | null;
  setEditingTxn: (value: PensionTransaction | null) => void;
  totalInBase: number;
  totalMonthlyContribInBase: number;
  projected: number | null;
  monthlyDrawdown: number | null;
  yearsToRetirement: number | null;
  pensionGrowthData: PensionGrowthPoint[];
  pensionGrowthPct: number | null;
  handleSave: (pot: PensionPot | Omit<PensionPot, 'id'>) => void;
  handleAddPensionTxn: (txn: SavePensionTransactionInput) => Promise<SavePensionTransactionResult>;
  handleDeletePensionTxn: (id: number) => void;
  deletePot: DeletePotMutation;
};
