import { createHash } from 'node:crypto';
import {
  MONTH_ABBREVIATIONS,
  sumMoney,
  toCents,
  type BudgetMonth,
  type CsvClosingBalance,
  type CsvImportKind,
  type CsvImportMapping,
  type CsvRowStatus,
  type CurrencyCode,
} from '@quro/shared';
import {
  deriveExternalIds,
  normalizeRecord,
  resolveColumns,
  resolveDateFormat,
  type NormalizedRow,
} from './normalize';
import { CsvFormatError, parseCsv } from './parse';

export const MIN_BUDGET_YEAR = 2000;
export const MAX_BUDGET_YEAR = 9999;

export type AnalyzedRow = {
  rowNumber: number;
  line: number;
  status: CsvRowStatus;
  reason: string | null;
  /** Present for every row that parsed, whatever its status. */
  row: NormalizedRow | null;
  externalId: string | null;
};

export type Analysis = {
  fileSha256: string;
  headers: string[];
  delimiter: ',' | ';' | '\t' | '|';
  dateFormat: string | null;
  rows: AnalyzedRow[];
  closing: CsvClosingBalance | null;
  warnings: string[];
};

export class ImportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportInputError';
  }
}

export const sha256Hex = (text: string) => createHash('sha256').update(text).digest('hex');

export function budgetMonthOf(date: string): { month: BudgetMonth; year: number } {
  return {
    month: MONTH_ABBREVIATIONS[Number(date.slice(5, 7)) - 1]!,
    year: Number(date.slice(0, 4)),
  };
}

/** The closing balance a statement's running-balance column ends on, when it is unambiguous. */
function closingFromColumn(
  rows: readonly NormalizedRow[],
  warnings: string[],
): CsvClosingBalance | null {
  const withBalance = rows.filter((row) => row.balance !== null);
  if (withBalance.length === 0) return null;
  const latest = withBalance.reduce((max, row) => (row.date > max ? row.date : max), '');
  const onLatest = withBalance.filter((row) => row.date === latest);
  // Several rows on the last day: the closing one is the one no other row follows, where a row
  // follows another when its balance minus its amount is the other's balance.
  const finals = onLatest.filter(
    (row) =>
      !onLatest.some(
        (other) =>
          other !== row &&
          toCents(other.balance!) - toCents(other.amount) === toCents(row.balance!),
      ),
  );
  if (finals.length !== 1) {
    warnings.push(
      `Several rows on ${latest} show balances that do not follow one another, so the closing balance is not clear. Enter it yourself to compare.`,
    );
    return null;
  }
  const row = finals[0]!;
  return { amount: row.balance!, date: latest, origin: 'column', rowNumber: row.rowNumber };
}

type ParsedRows = {
  headers: string[];
  delimiter: Analysis['delimiter'];
  dateFormat: string | null;
  rows: AnalyzedRow[];
  valid: NormalizedRow[];
};

function readRows(kind: CsvImportKind, csv: string, mapping: CsvImportMapping): ParsedRows {
  let parsed;
  try {
    parsed = parseCsv(csv, mapping.delimiter);
  } catch (error) {
    if (error instanceof CsvFormatError) throw new ImportInputError(error.message);
    throw error;
  }
  const indexes = resolveColumns(mapping.columns, parsed.headers);
  if (!indexes.ok) throw new ImportInputError(indexes.error);
  if (parsed.records.length === 0) throw new ImportInputError('The file has no rows');

  const dateCells = parsed.records.map((record) => record.cells[indexes.value.date!] ?? '');
  const resolution = resolveDateFormat(mapping.dateFormat, dateCells);
  if (!resolution.ok) throw new ImportInputError(resolution.error);

  const rows: AnalyzedRow[] = [];
  const valid: NormalizedRow[] = [];
  for (const record of parsed.records) {
    const result = normalizeRecord(record, indexes.value, mapping, kind, resolution.format);
    const base = { rowNumber: record.rowNumber, line: record.line, externalId: null };
    if (result.ok) {
      valid.push(result.value);
      rows.push({ ...base, status: 'ready', reason: null, row: result.value });
    } else {
      rows.push({ ...base, status: 'error', reason: result.error, row: null });
    }
  }
  return {
    headers: parsed.headers,
    delimiter: parsed.delimiter,
    dateFormat: resolution.format,
    rows,
    valid,
  };
}

/** Why a parsed row is not importable on this target, or null. */
function targetRefusal(
  kind: CsvImportKind,
  row: NormalizedRow,
  accountCurrency: CurrencyCode | undefined,
): { status: 'error' | 'skipped'; reason: string } | null {
  if (kind === 'savings') {
    return accountCurrency && row.currency !== accountCurrency
      ? {
          status: 'error',
          reason: `The row is in ${row.currency} but the account is in ${accountCurrency}; rows are never converted`,
        }
      : null;
  }
  if (row.amount > 0) {
    return { status: 'skipped', reason: 'Money in (income or a refund) is not a budget expense' };
  }
  const { year } = budgetMonthOf(row.date);
  return year < MIN_BUDGET_YEAR || year > MAX_BUDGET_YEAR
    ? { status: 'error', reason: 'The year is outside the budget range' }
    : null;
}

/**
 * Reads a file against a mapping without touching the database. Rows that cannot be imported
 * carry their reason; the rest are `ready` until the caller compares them with the ledger.
 * `accountCurrency` is the savings account's currency: a row in another currency is refused,
 * never converted.
 */
export function analyzeCsv(input: {
  kind: CsvImportKind;
  csv: string;
  mapping: CsvImportMapping;
  accountCurrency?: CurrencyCode;
}): Analysis {
  const { kind, mapping } = input;
  const read = readRows(kind, input.csv, mapping);
  const ids = deriveExternalIds(read.valid);
  const idByRow = new Map(read.valid.map((row, index) => [row.rowNumber, ids[index]!]));
  const seen = new Set<string>();
  for (const entry of read.rows) {
    if (entry.row === null) continue;
    entry.externalId = idByRow.get(entry.rowNumber)!;
    const refusal = targetRefusal(kind, entry.row, input.accountCurrency);
    if (refusal) {
      Object.assign(entry, refusal);
    } else if (seen.has(entry.externalId)) {
      entry.status = 'duplicate';
      entry.reason = 'The same id appears earlier in this file';
    } else {
      seen.add(entry.externalId);
    }
  }

  const warnings: string[] = [];
  if (read.rows.some((entry) => entry.row?.formulaLike)) {
    warnings.push(
      'Some text starts with = + - or @. It is stored as plain text and written with a leading apostrophe in exports, so spreadsheets do not run it.',
    );
  }
  return {
    fileSha256: sha256Hex(input.csv),
    headers: read.headers,
    delimiter: read.delimiter,
    dateFormat: read.dateFormat,
    rows: read.rows,
    closing: kind === 'savings' ? closingFromColumn(read.valid, warnings) : null,
    warnings,
  };
}

/** Net signed amount by currency of the rows with `status`, summed in cents. */
export function totalsByCurrency(rows: readonly AnalyzedRow[], status: CsvRowStatus) {
  const byCurrency = new Map<CurrencyCode, number[]>();
  for (const entry of rows) {
    if (entry.status !== status || entry.row === null) continue;
    const list = byCurrency.get(entry.row.currency) ?? [];
    list.push(entry.row.amount);
    byCurrency.set(entry.row.currency, list);
  }
  return [...byCurrency].map(([currency, amounts]) => ({ currency, amount: sumMoney(amounts) }));
}
