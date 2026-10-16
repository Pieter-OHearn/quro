import {
  CSV_DATE_FORMATS,
  type CsvColumnMapping,
  type CsvDateFormat,
  type CsvDecimalSeparator,
  type CsvImportKind,
  type CsvImportMapping,
  type CsvImportProfile,
  type CurrencyCode,
} from '@quro/shared';

/** The mapping form's state: strings only, so an unfinished choice is representable. */
export type MappingDraft = {
  source: string;
  amountMode: 'signed' | 'split';
  columns: Record<keyof CsvColumnMapping, string>;
  dateFormat: CsvDateFormat;
  decimalSeparator: CsvDecimalSeparator;
  defaultCurrency: CurrencyCode;
  invertSign: boolean;
  defaultCategory: string;
  closingBalance: string;
  closingDate: string;
};

export const NO_COLUMN = '';

const EMPTY_COLUMNS: MappingDraft['columns'] = {
  date: NO_COLUMN,
  amount: NO_COLUMN,
  debit: NO_COLUMN,
  credit: NO_COLUMN,
  description: NO_COLUMN,
  currency: NO_COLUMN,
  externalId: NO_COLUMN,
  balance: NO_COLUMN,
  category: NO_COLUMN,
  merchant: NO_COLUMN,
};

export function emptyDraft(currency: CurrencyCode): MappingDraft {
  return {
    source: '',
    amountMode: 'signed',
    columns: { ...EMPTY_COLUMNS },
    dateFormat: 'auto',
    decimalSeparator: '.',
    defaultCurrency: currency,
    invertSign: false,
    defaultCategory: 'Uncategorised',
    closingBalance: '',
    closingDate: '',
  };
}

export function draftFromSuggestion(
  base: MappingDraft,
  suggestion: Partial<CsvColumnMapping>,
): MappingDraft {
  const columns = { ...EMPTY_COLUMNS, ...suggestion };
  const split = !columns.amount && Boolean(columns.debit || columns.credit);
  return { ...base, columns, amountMode: split ? 'split' : 'signed' };
}

export function draftFromProfile(base: MappingDraft, profile: CsvImportProfile): MappingDraft {
  const { mapping } = profile;
  return {
    ...base,
    source: mapping.source,
    amountMode: mapping.columns.amount ? 'signed' : 'split',
    columns: { ...EMPTY_COLUMNS, ...mapping.columns },
    dateFormat: mapping.dateFormat,
    decimalSeparator: mapping.decimalSeparator,
    defaultCurrency: mapping.defaultCurrency,
    invertSign: mapping.invertSign,
    defaultCategory: mapping.defaultCategory,
  };
}

/** A saved mapping fits a file when every column it names is in the file's header. */
export function profileFits(profile: CsvImportProfile, headers: readonly string[]): boolean {
  return Object.values(profile.mapping.columns).every(
    (column) => !column || headers.includes(column),
  );
}

const SIGNED_ONLY = ['amount'] as const;
const SPLIT_ONLY = ['debit', 'credit'] as const;
const BUDGET_ONLY = ['category', 'merchant'] as const;

function chosenColumns(draft: MappingDraft, kind: CsvImportKind): CsvColumnMapping {
  const skip = new Set<string>(draft.amountMode === 'signed' ? SPLIT_ONLY : SIGNED_ONLY);
  const kindSkip: readonly string[] = kind === 'budget' ? ['balance'] : BUDGET_ONLY;
  for (const field of kindSkip) skip.add(field);
  const chosen: Record<string, string> = {};
  for (const [field, header] of Object.entries(draft.columns)) {
    if (header !== NO_COLUMN && !skip.has(field)) chosen[field] = header;
  }
  return chosen as CsvColumnMapping;
}

export function draftToMapping(draft: MappingDraft, kind: CsvImportKind): CsvImportMapping {
  return {
    source: draft.source.trim(),
    delimiter: 'auto',
    columns: chosenColumns(draft, kind),
    dateFormat: draft.dateFormat,
    decimalSeparator: draft.decimalSeparator,
    defaultCurrency: draft.defaultCurrency,
    invertSign: draft.invertSign,
    defaultCategory: draft.defaultCategory.trim() || 'Uncategorised',
  };
}

/** Why the draft cannot be previewed yet, or null. */
export function draftProblem(draft: MappingDraft): string | null {
  const { columns } = draft;
  if (draft.source.trim() === '') return 'Name the source, for example the bank and account.';
  if (!columns.date) return 'Choose the date column.';
  if (!columns.description) return 'Choose the description column.';
  if (draft.amountMode === 'signed' && !columns.amount) return 'Choose the amount column.';
  if (draft.amountMode === 'split' && !columns.debit && !columns.credit) {
    return 'Choose a debit or a credit column.';
  }
  return null;
}

export const DATE_FORMAT_OPTIONS = CSV_DATE_FORMATS.map((format) => ({
  value: format,
  label: format === 'auto' ? 'Detect from the file' : format,
}));
