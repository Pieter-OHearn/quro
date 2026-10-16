// CSV for data exports (RFC 4180: comma separated, CRLF line ends, fields with a comma, quote,
// CR or LF quoted, quotes doubled).
//
// Spreadsheets run a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return as a
// formula, so a text value such as a merchant name `=HYPERLINK(...)` would run when the file is
// opened. Text values that start with one of those characters are written with a leading
// apostrophe, which spreadsheets show as text. Numbers, booleans and dates are written as they
// are, so a negative amount stays a number. The JSON file of an export keeps every value exactly.

export type CsvValue = string | number | boolean | null | undefined | Date | object;

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
export const CSV_FORMULA_ESCAPE = "'";

/** A text value as a spreadsheet will read it: formula-like text gets a leading apostrophe. */
export function guardCsvText(value: string): string {
  return FORMULA_TRIGGER.test(value) ? `${CSV_FORMULA_ESCAPE}${value}` : value;
}

function cellText(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return guardCsvText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  // JSON columns (lists, objects) are written as JSON text, which never starts with a trigger.
  return JSON.stringify(value);
}

export function encodeCsvCell(value: CsvValue): string {
  const text = cellText(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A CSV document: a header row of `columns`, then one row per record, CRLF line ends. */
export function encodeCsv(
  columns: readonly string[],
  rows: readonly Record<string, CsvValue>[],
): string {
  const lines = [columns.map(encodeCsvCell).join(',')];
  for (const row of rows) lines.push(columns.map((column) => encodeCsvCell(row[column])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
