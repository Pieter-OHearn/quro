import type { CurrencyCode } from './index.js';

/** What a CSV import writes to. Savings rows land in one account, budget rows in categories. */
export const CSV_IMPORT_KINDS = ['savings', 'budget'] as const;
export type CsvImportKind = (typeof CSV_IMPORT_KINDS)[number];

export const CSV_DELIMITERS = ['auto', ',', ';', '\t', '|'] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

/** `auto` picks the one format every date in the file fits and refuses a file that fits several. */
export const CSV_DATE_FORMATS = [
  'auto',
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD-MM-YYYY',
  'DD.MM.YYYY',
] as const;
export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number];

export const CSV_DECIMAL_SEPARATORS = ['.', ','] as const;
export type CsvDecimalSeparator = (typeof CSV_DECIMAL_SEPARATORS)[number];

export const CSV_IMPORT_LIMITS = {
  maxBytes: 2_000_000,
  maxRows: 5_000,
  maxColumns: 50,
  maxCellLength: 2_000,
  /** Rows one commit request writes. */
  commitBatchRows: 200,
  maxSourceLength: 60,
} as const;

/** Header names of the columns to read. Columns are matched by header, never by position. */
export type CsvColumnMapping = {
  date: string;
  /** One signed amount column, or `debit` and `credit` columns (both unsigned or signed). */
  amount?: string;
  debit?: string;
  credit?: string;
  description: string;
  currency?: string;
  /** The bank's own row id. Without it Quro derives a key from the row's contents. */
  externalId?: string;
  /** Savings: running balance after the row, used to find the statement's closing balance. */
  balance?: string;
  /** Budget: category name; unknown names are created for the row's month. */
  category?: string;
  /** Budget: merchant; the description is used when it is missing. */
  merchant?: string;
};

export type CsvImportMapping = {
  /** Names where the file came from, such as `ING current account`. Part of the duplicate key. */
  source: string;
  delimiter: CsvDelimiter;
  columns: CsvColumnMapping;
  dateFormat: CsvDateFormat;
  decimalSeparator: CsvDecimalSeparator;
  /** Currency of rows without a currency column. */
  defaultCurrency: CurrencyCode;
  /** The file writes money going out as positive numbers. */
  invertSign: boolean;
  /** Budget: category for rows without one. */
  defaultCategory: string;
};

export type CsvImportProfile = {
  id: number;
  kind: CsvImportKind;
  source: string;
  mapping: CsvImportMapping;
  updatedAt: string;
};

export const CSV_ROW_STATUSES = [
  'ready',
  'duplicate',
  'possibleDuplicate',
  'skipped',
  'error',
] as const;
export type CsvRowStatus = (typeof CSV_ROW_STATUSES)[number];

export type CsvPreviewRow = {
  /** 1 for the first record after the header. */
  rowNumber: number;
  /** The physical line of the file the record starts on. */
  line: number;
  status: CsvRowStatus;
  /** Why the row is not `ready`; never quotes another account's data. */
  reason: string | null;
  date: string | null;
  /** Signed: money in is positive, money out is negative. */
  amount: number | null;
  currency: CurrencyCode | null;
  description: string | null;
  category: string | null;
  externalId: string | null;
  /** The text starts with a character spreadsheets run as a formula. */
  formulaLike: boolean;
};

export type CsvClosingBalance = {
  amount: number;
  date: string;
  origin: 'column' | 'entered';
  /** Row number the balance was read from, for `column`. */
  rowNumber: number | null;
};

export type CsvReconciliation = {
  closing: CsvClosingBalance;
  /** The account balance as of the closing date, from the ledger. */
  ledgerBalance: number;
  /** Closing balance minus the ledger balance. Zero means they agree. */
  difference: number;
};

export type CsvPreviewSummary = {
  totalRows: number;
  ready: number;
  duplicate: number;
  possibleDuplicate: number;
  skipped: number;
  error: number;
  /** Net effect of the ready rows by currency (savings: one account currency). */
  totals: { currency: CurrencyCode; amount: number }[];
};

export type CsvImportPreview = {
  fileSha256: string;
  headers: string[];
  delimiter: Exclude<CsvDelimiter, 'auto'>;
  /** The date format used; for `auto` the one the file resolved to. */
  dateFormat: Exclude<CsvDateFormat, 'auto'> | null;
  summary: CsvPreviewSummary;
  rows: CsvPreviewRow[];
  /** Savings: the closing balance and how it compares to the ledger once the ready rows land. */
  reconciliation: CsvReconciliation | null;
  warnings: string[];
};

export const CSV_IMPORT_STATUSES = ['staged', 'committed', 'cancelled'] as const;
export type CsvImportStatus = (typeof CSV_IMPORT_STATUSES)[number];

export type CsvImportProgress = {
  id: number;
  kind: CsvImportKind;
  accountId: number | null;
  source: string;
  fileName: string | null;
  fileSha256: string;
  status: CsvImportStatus;
  total: number;
  committed: number;
  duplicate: number;
  failed: number;
  pending: number;
  createdAt: string;
  committedAt: string | null;
  /** Savings, once rows have landed: how the ledger compares to the statement's closing balance. */
  reconciliation: (CsvReconciliation & { adjustmentApplied: boolean }) | null;
};

export type CsvImportRowOutcome = {
  rowNumber: number;
  status: 'pending' | 'committed' | 'duplicate' | 'failed';
  date: string;
  amount: number;
  currency: CurrencyCode;
  description: string;
  error: string | null;
  transactionId: number | null;
};
