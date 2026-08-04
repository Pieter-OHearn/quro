import type {
  AppCapabilityStatus,
  PensionImportCollisionWarning,
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

export type IntegerLike = number | string | null | undefined;

export type ApiPensionPot = Omit<PensionPot, 'metadata' | 'color' | 'emoji'> & {
  color: string | null;
  emoji: string | null;
  metadata?: unknown;
};

export type ApiPensionTransaction = PensionTransaction;

export type ApiPensionStatementDocument = Omit<PensionStatementDocument, 'sizeBytes' | 'mimeType'> &
  ApiPdfDocument;

export type ApiPensionStatementImport = PensionStatementImport;

export type ApiPensionStatementImportFeedItem = Omit<PensionStatementImportFeedItem, 'import'> & {
  import: ApiPensionStatementImport;
  pot: {
    id: IntegerLike;
    name: string;
    provider: string;
    emoji: string | null;
  };
};

export type ApiPensionStatementImportSummary = PensionStatementImportSummary;

export type ApiPensionStatementImportRow = Omit<PensionStatementImportRow, 'collisionWarning'> & {
  collisionWarning?: PensionImportCollisionWarning | null;
};

export type UpdatePensionImportRowPayload = Partial<
  Pick<PensionStatementImportRow, 'type' | 'amount' | 'taxAmount' | 'date' | 'note' | 'isEmployer'>
>;

export type DeletePotMutation = {
  mutate: (input: { id: number; mode?: 'preserveTransactions' | 'deleteTransactions' }) => void;
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
