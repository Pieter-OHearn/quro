import { createHash } from 'node:crypto';
import {
  CSV_DATE_FORMATS,
  CSV_DECIMAL_SEPARATORS,
  CSV_DELIMITERS,
  CSV_IMPORT_LIMITS,
  isCurrencyCode,
  toCents,
  type CsvColumnMapping,
  type CsvDateFormat,
  type CsvImportKind,
  type CsvImportMapping,
  type CurrencyCode,
} from '@quro/shared';
import { CSV_FORMULA_ESCAPE } from '../csv';
import {
  err,
  isRecord,
  ok,
  parseDateString,
  rejectUnknownFields,
  toMoneyAmount,
  type ParseResult,
} from '../requestValidation';
import type { CsvRecord } from './parse';

// ── Mapping ──────────────────────────────────────────────────────────────────

const MAPPING_FIELDS = [
  'source',
  'delimiter',
  'columns',
  'dateFormat',
  'decimalSeparator',
  'defaultCurrency',
  'invertSign',
  'defaultCategory',
] as const;
const COLUMN_FIELDS = [
  'date',
  'amount',
  'debit',
  'credit',
  'description',
  'currency',
  'externalId',
  'balance',
  'category',
  'merchant',
] as const;
const MAX_HEADER_LENGTH = 200;
const MAX_CATEGORY_LENGTH = 80;
export const DEFAULT_BUDGET_CATEGORY = 'Uncategorised';

function parseColumnName(value: unknown, label: string, required: boolean): ParseResult<string> {
  if (value === undefined || value === null || value === '') {
    return required ? err(`Choose the ${label} column`) : ok('');
  }
  if (typeof value !== 'string' || value.length > MAX_HEADER_LENGTH) {
    return err(`The ${label} column is not valid`);
  }
  return ok(value);
}

function checkColumnCombination(
  columns: Partial<Record<(typeof COLUMN_FIELDS)[number], string>>,
  kind: CsvImportKind,
): ParseResult<void> {
  const hasSigned = columns.amount !== undefined;
  const hasSplit = columns.debit !== undefined || columns.credit !== undefined;
  if (hasSigned === hasSplit) {
    return err('Map either one amount column or a debit and a credit column');
  }
  if (kind === 'budget' && columns.balance !== undefined) {
    return err('A budget import has no balance column');
  }
  const budgetOnly = columns.category !== undefined || columns.merchant !== undefined;
  if (kind === 'savings' && budgetOnly) {
    return err('A savings import has no category or merchant column');
  }
  return ok(undefined);
}

function parseColumns(value: unknown, kind: CsvImportKind): ParseResult<CsvColumnMapping> {
  if (!isRecord(value)) return err('Columns must be an object');
  const unknown = rejectUnknownFields(value, COLUMN_FIELDS);
  if (!unknown.ok) return unknown;
  const columns: Partial<Record<(typeof COLUMN_FIELDS)[number], string>> = {};
  for (const field of COLUMN_FIELDS) {
    const required = field === 'date' || field === 'description';
    const parsed = parseColumnName(value[field], field, required);
    if (!parsed.ok) return parsed;
    if (parsed.value !== '') columns[field] = parsed.value;
  }
  const combination = checkColumnCombination(columns, kind);
  return combination.ok ? ok(columns as CsvColumnMapping) : combination;
}

function parseSource(value: unknown): ParseResult<string> {
  const source = typeof value === 'string' ? value.trim() : '';
  return source === '' || source.length > CSV_IMPORT_LIMITS.maxSourceLength
    ? err(`Name the source in 1 to ${CSV_IMPORT_LIMITS.maxSourceLength} characters`)
    : ok(source);
}

function parseChoice<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
  error: string,
): ParseResult<T> {
  const chosen = value ?? fallback;
  return choices.includes(chosen as T) ? ok(chosen as T) : err(error);
}

function parseDefaultCategory(value: unknown): ParseResult<string> {
  const category =
    typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_BUDGET_CATEGORY;
  return category.length > MAX_CATEGORY_LENGTH
    ? err('The default category is too long')
    : ok(category);
}

type MappingOptions = Omit<CsvImportMapping, 'columns'>;

function parseMappingOptions(value: Record<string, unknown>): ParseResult<MappingOptions> {
  const source = parseSource(value.source);
  const delimiter = parseChoice(value.delimiter, CSV_DELIMITERS, 'auto', 'Invalid delimiter');
  const dateFormat = parseChoice(value.dateFormat, CSV_DATE_FORMATS, 'auto', 'Invalid date format');
  const decimalSeparator = parseChoice(
    value.decimalSeparator,
    CSV_DECIMAL_SEPARATORS,
    '.',
    'Invalid decimal separator',
  );
  const defaultCategory = parseDefaultCategory(value.defaultCategory);
  const checked = [source, delimiter, dateFormat, decimalSeparator, defaultCategory];
  const failed = checked.find((result) => !result.ok);
  if (failed && !failed.ok) return failed;
  if (!isCurrencyCode(value.defaultCurrency)) return err('Choose the currency of the file');
  if (value.invertSign !== undefined && typeof value.invertSign !== 'boolean') {
    return err('invertSign must be true or false');
  }
  return ok({
    source: (source as { value: string }).value,
    delimiter: (delimiter as { value: MappingOptions['delimiter'] }).value,
    dateFormat: (dateFormat as { value: CsvDateFormat }).value,
    decimalSeparator: (decimalSeparator as { value: '.' | ',' }).value,
    defaultCurrency: value.defaultCurrency,
    invertSign: value.invertSign === true,
    defaultCategory: (defaultCategory as { value: string }).value,
  });
}

export function parseImportMapping(
  value: unknown,
  kind: CsvImportKind,
): ParseResult<CsvImportMapping> {
  if (!isRecord(value)) return err('Invalid import mapping');
  const unknown = rejectUnknownFields(value, MAPPING_FIELDS);
  if (!unknown.ok) return unknown;
  const options = parseMappingOptions(value);
  if (!options.ok) return options;
  const columns = parseColumns(value.columns, kind);
  return columns.ok ? ok({ ...options.value, columns: columns.value }) : columns;
}

// ── Dates ────────────────────────────────────────────────────────────────────

type ConcreteDateFormat = Exclude<CsvDateFormat, 'auto'>;
const CONCRETE_FORMATS = CSV_DATE_FORMATS.filter(
  (format): format is ConcreteDateFormat => format !== 'auto',
);

const DATE_SHAPES: Record<ConcreteDateFormat, RegExp> = {
  'YYYY-MM-DD': /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  'YYYY/MM/DD': /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  'DD/MM/YYYY': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  'MM/DD/YYYY': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  'DD-MM-YYYY': /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  'DD.MM.YYYY': /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
};
const pad = (value: string, length: number) => value.padStart(length, '0');

/** The ISO date a cell holds in `format`, or null when it does not fit (including 31 February). */
export function parseDateWithFormat(cell: string, format: ConcreteDateFormat): string | null {
  const match = DATE_SHAPES[format].exec(cell.trim());
  if (!match) return null;
  const [, a, b, c] = match as unknown as [string, string, string, string];
  let year: string;
  let month: string;
  let day: string;
  if (format.startsWith('YYYY')) [year, month, day] = [a, b, c];
  else if (format.startsWith('MM')) [month, day, year] = [a, b, c];
  else [day, month, year] = [a, b, c];
  return parseDateString(`${year}-${pad(month, 2)}-${pad(day, 2)}`);
}

export type DateResolution =
  { ok: true; format: ConcreteDateFormat | null } | { ok: false; error: string };

/**
 * The format every non-empty date cell fits. With a stated format that format is used as is. With
 * `auto` exactly one format must fit all cells: `03/04/2025` alone fits both day-first and
 * month-first, so the file is refused until one is chosen. A file whose dates settle it (any
 * `25/04/2025`) resolves.
 */
export function resolveDateFormat(
  requested: CsvDateFormat,
  cells: readonly string[],
): DateResolution {
  if (requested !== 'auto') return { ok: true, format: requested };
  const present = cells.map((cell) => cell.trim()).filter((cell) => cell !== '');
  if (present.length === 0) return { ok: true, format: null };
  const fitting = CONCRETE_FORMATS.filter((format) =>
    present.every((cell) => parseDateWithFormat(cell, format) !== null),
  );
  if (fitting.length === 1) return { ok: true, format: fitting[0]! };
  if (fitting.length === 0) {
    return { ok: false, error: 'The dates do not all use one format; choose the date format' };
  }
  return {
    ok: false,
    error: `The dates fit more than one format (${fitting.join(' or ')}); choose the date format`,
  };
}

// ── Amounts ──────────────────────────────────────────────────────────────────

const CURRENCY_MARKS = /[€£$]|\b(?:EUR|GBP|USD|AUD|NZD|CAD|CHF|SGD)\b/gi;
// Spaces, no-break spaces (U+00A0, U+202F) and apostrophes group digits in some locales.
const WHITESPACE = /[\s\u00a0\u202f']/g;

function isPlainAmount(whole: string, fraction: string): boolean {
  const digitsOnly = /^\d*$/.test(whole) && /^\d*$/.test(fraction);
  // Cents are never rounded away silently: 12.345 is refused, 12.50 and 12.500 are fine.
  return digitsOnly && (whole !== '' || fraction !== '') && fraction.replace(/0+$/, '').length <= 2;
}

/**
 * An amount in a stated notation: `1.234,56` with `,` as the decimal separator, `1,234.56` with
 * `.`. Accepts a leading or trailing sign, accounting brackets `(12.50)` for negatives, spaces,
 * apostrophes and the other separator as thousands grouping (which must group by three), and a
 * currency mark. Refuses exponents, hex, empty cells, a second decimal separator and a grouping
 * that is not by three, more than two decimals, so `1.5` read with `,` as decimal is an error, not 15.
 */
/** Removes accounting brackets and a leading or trailing sign; says whether the amount is negative. */
function splitSign(input: string): { digits: string; negative: boolean } {
  let text = input;
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1);
  }
  const trailing = text.at(-1);
  const leading = text[0];
  if (trailing === '-' || trailing === '+') {
    negative = negative || trailing === '-';
    text = text.slice(0, -1);
  } else if (leading === '-' || leading === '+') {
    negative = negative || leading === '-';
    text = text.slice(1);
  }
  return { digits: text, negative };
}

/** The integer part with its thousands grouping removed; null when the grouping is not by three. */
function ungroup(integerPart: string, grouping: string): string | null {
  const groups = integerPart.split(grouping);
  if (groups.length === 1) return integerPart;
  const [first, ...rest] = groups as [string, ...string[]];
  const grouped = /^\d{1,3}$/.test(first) && rest.every((group) => /^\d{3}$/.test(group));
  return grouped ? groups.join('') : null;
}

/**
 * An amount in a stated notation: `1.234,56` with `,` as the decimal separator, `1,234.56` with
 * `.`. Accepts a leading or trailing sign, accounting brackets `(12.50)` for negatives, spaces,
 * apostrophes and the other separator as thousands grouping (which must group by three), and a
 * currency mark. Refuses exponents, hex, empty cells, a second decimal separator, a grouping
 * that is not by three and more than two decimals, so `1.5` read with `,` as decimal is an
 * error, not 15, and 12.345 is refused rather than rounded.
 */
export function parseCsvAmount(cell: string, decimalSeparator: '.' | ','): number | null {
  const compact = cell.replace(CURRENCY_MARKS, '').replace(WHITESPACE, '');
  const { digits, negative } = splitSign(compact);
  const parts = digits.split(decimalSeparator);
  const [integerPart = '', fraction = ''] = parts;
  const whole = ungroup(integerPart, decimalSeparator === '.' ? ',' : '.');
  if (parts.length > 2 || whole === null || !isPlainAmount(whole, fraction)) return null;
  const value = Number(`${whole || '0'}.${fraction || '0'}`);
  return negative ? -value : value;
}

// ── Text ─────────────────────────────────────────────────────────────────────

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const MAX_TEXT_LENGTH = 500;
const MAX_EXTERNAL_ID_LENGTH = 200;
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

/**
 * A text cell as it is stored: control characters removed, whitespace collapsed, cut to a
 * length. A leading apostrophe that Quro's own export puts before formula-like text is taken
 * off again. The text is otherwise kept exactly; it is data, and exports guard it on the way out.
 */
export function cleanText(cell: string): { text: string; formulaLike: boolean } {
  let text = cell.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
  if (text.startsWith(CSV_FORMULA_ESCAPE) && FORMULA_TRIGGER.test(text.slice(1))) {
    text = text.slice(1);
  }
  return { text: text.slice(0, MAX_TEXT_LENGTH), formulaLike: FORMULA_TRIGGER.test(text) };
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export type NormalizedRow = {
  rowNumber: number;
  line: number;
  date: string;
  /** Signed, in `currency`: money in is positive. */
  amount: number;
  currency: CurrencyCode;
  description: string;
  merchant: string | null;
  category: string | null;
  /** The bank's id when mapped; otherwise derived from the row (see `deriveExternalIds`). */
  externalId: string | null;
  balance: number | null;
  formulaLike: boolean;
};

export type RowError = { rowNumber: number; line: number; error: string };

export type ColumnIndexes = Record<keyof CsvColumnMapping, number | undefined>;

export function resolveColumns(
  columns: CsvColumnMapping,
  headers: readonly string[],
): ParseResult<ColumnIndexes> {
  const indexes = {} as ColumnIndexes;
  for (const field of COLUMN_FIELDS) {
    const header = columns[field];
    if (header === undefined) continue;
    const index = headers.indexOf(header);
    if (index === -1) return err(`The file has no column named "${header}"`);
    indexes[field] = index;
  }
  return ok(indexes);
}

const cellAt = (record: CsvRecord, index: number | undefined) =>
  index === undefined ? '' : (record.cells[index] ?? '');

const NOT_A_NUMBER = 'The amount is not a number with at most two decimals in the chosen notation';

function splitDebitCredit(
  record: CsvRecord,
  indexes: ColumnIndexes,
  separator: '.' | ',',
): ParseResult<number> {
  const parseSide = (index: number | undefined) => {
    const cell = cellAt(record, index).trim();
    return cell === '' ? 0 : parseCsvAmount(cell, separator);
  };
  const debit = parseSide(indexes.debit);
  const credit = parseSide(indexes.credit);
  if (debit === null || credit === null) return err(NOT_A_NUMBER);
  if (debit !== 0 && credit !== 0) return err('The row has both a debit and a credit');
  // Both columns are read as magnitudes: a debit is money out, a credit money in.
  return ok(Math.abs(credit) - Math.abs(debit));
}

function signedAmount(
  record: CsvRecord,
  indexes: ColumnIndexes,
  mapping: CsvImportMapping,
): ParseResult<number> {
  const separator = mapping.decimalSeparator;
  let base: ParseResult<number>;
  if (indexes.amount === undefined) {
    base = splitDebitCredit(record, indexes, separator);
  } else {
    const parsed = parseCsvAmount(cellAt(record, indexes.amount), separator);
    base = parsed === null ? err(NOT_A_NUMBER) : ok(parsed);
  }
  if (!base.ok) return base;
  const money = toMoneyAmount(mapping.invertSign ? -base.value : base.value, 'amount');
  if (!money.ok) return err('The amount is too large');
  return money.value === 0 ? err('The amount is zero') : money;
}

function readDate(cell: string, dateFormat: ConcreteDateFormat | null): ParseResult<string> {
  if (cell === '') return err('The date is missing');
  const date = dateFormat === null ? null : parseDateWithFormat(cell, dateFormat);
  if (date === null) return err('The date does not match the date format');
  const year = Number(date.slice(0, 4));
  return year < MIN_YEAR || year > MAX_YEAR ? err('The date is outside 1990 to 2100') : ok(date);
}

function readCurrency(cell: string, fallback: CurrencyCode): ParseResult<CurrencyCode> {
  const code = cell.trim().toUpperCase();
  if (code === '') return ok(fallback);
  return isCurrencyCode(code) ? ok(code) : err('The currency is not supported');
}

function readBalance(cell: string, separator: '.' | ','): number | null {
  if (cell.trim() === '') return null;
  const parsed = parseCsvAmount(cell, separator);
  const money = parsed === null ? null : toMoneyAmount(parsed, 'balance');
  return money?.ok ? money.value : null;
}

type RowCore = { date: string; amount: number; currency: CurrencyCode; externalId: string | null };

function readCore(
  record: CsvRecord,
  indexes: ColumnIndexes,
  mapping: CsvImportMapping,
  dateFormat: ConcreteDateFormat | null,
): ParseResult<RowCore> {
  const date = readDate(cellAt(record, indexes.date).trim(), dateFormat);
  if (!date.ok) return date;
  const amount = signedAmount(record, indexes, mapping);
  if (!amount.ok) return amount;
  const currency = readCurrency(cellAt(record, indexes.currency), mapping.defaultCurrency);
  if (!currency.ok) return currency;
  const externalId = cellAt(record, indexes.externalId).trim();
  if (externalId.length > MAX_EXTERNAL_ID_LENGTH) return err('The external id is too long');
  return ok({
    date: date.value,
    amount: amount.value,
    currency: currency.value,
    externalId: externalId === '' ? null : externalId,
  });
}

type RowText = Pick<NormalizedRow, 'description' | 'merchant' | 'category' | 'formulaLike'>;

function readTexts(
  record: CsvRecord,
  indexes: ColumnIndexes,
  mapping: CsvImportMapping,
  kind: CsvImportKind,
): ParseResult<RowText> {
  const description = cleanText(cellAt(record, indexes.description));
  const merchant = cleanText(cellAt(record, indexes.merchant));
  const category = cleanText(cellAt(record, indexes.category));
  const text = description.text || merchant.text;
  if (text === '') return err('The description is missing');
  const budget = kind === 'budget';
  return ok({
    description: text,
    merchant: budget ? merchant.text || text : null,
    category: budget ? category.text || mapping.defaultCategory : null,
    formulaLike: description.formulaLike || merchant.formulaLike || category.formulaLike,
  });
}

/** One record as a normalized row, or the reason the record cannot be imported. */
export function normalizeRecord(
  record: CsvRecord,
  indexes: ColumnIndexes,
  mapping: CsvImportMapping,
  kind: CsvImportKind,
  dateFormat: ConcreteDateFormat | null,
): ParseResult<NormalizedRow> {
  const highest = Math.max(...Object.values(indexes).filter((i) => i !== undefined));
  if (record.cells.length <= highest) return err('The row has fewer cells than the header');
  const core = readCore(record, indexes, mapping, dateFormat);
  if (!core.ok) return core;
  const texts = readTexts(record, indexes, mapping, kind);
  if (!texts.ok) return texts;
  return ok({
    rowNumber: record.rowNumber,
    line: record.line,
    ...core.value,
    ...texts.value,
    balance: readBalance(cellAt(record, indexes.balance), mapping.decimalSeparator),
  });
}

/**
 * Keys for rows without a bank id: a digest of the row's date, signed cents, currency and
 * description, plus how many identical rows came before it in the file. Two real purchases of
 * the same thing on one day get different keys; importing the same file again gives the same
 * keys, so nothing is added twice. Keys the bank supplies are used as they are.
 */
export function deriveExternalIds(rows: readonly NormalizedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.externalId !== null) return row.externalId;
    const content = [
      row.date,
      toCents(row.amount),
      row.currency,
      row.description.toLowerCase(),
    ].join('|');
    const occurrence = seen.get(content) ?? 0;
    seen.set(content, occurrence + 1);
    return `h:${createHash('sha256').update(`${content}|${occurrence}`).digest('hex').slice(0, 32)}`;
  });
}

// ── Column suggestions ───────────────────────────────────────────────────────

const COLUMN_KEYWORDS: Partial<Record<keyof CsvColumnMapping, readonly string[]>> = {
  date: ['date', 'datum'],
  amount: ['amount', 'bedrag'],
  debit: ['debit', 'withdrawal', 'money out'],
  credit: ['credit', 'deposit', 'money in'],
  description: ['description', 'omschrijving', 'memo', 'details', 'narrative', 'payee'],
  currency: ['currency', 'valuta'],
  externalId: ['transaction id', 'reference', 'referentie', 'id'],
  balance: ['balance', 'saldo'],
  category: ['category', 'categorie'],
  merchant: ['merchant', 'counterparty', 'name'],
};

/**
 * A first guess at the column mapping from the header names: for each field the first header
 * that equals or contains one of its keywords. A person confirms or changes every choice.
 */
export function suggestColumns(headers: readonly string[]): Partial<CsvColumnMapping> {
  const suggestion: Partial<CsvColumnMapping> = {};
  const taken = new Set<string>();
  for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS) as [
    keyof CsvColumnMapping,
    readonly string[],
  ][]) {
    const match = headers.find(
      (header) =>
        !taken.has(header) && keywords.some((word) => header.toLowerCase().includes(word)),
    );
    if (match !== undefined) {
      suggestion[field] = match;
      taken.add(match);
    }
  }
  return suggestion;
}
