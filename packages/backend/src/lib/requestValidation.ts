import { isCurrencyCode, type CurrencyCode, roundMoney, toIsoDate } from '@quro/shared';
import { parseNumber } from './numbers';

const MAX_INT32 = 2_147_483_647;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;
export type FieldParsers<T extends object> = {
  [K in keyof T]: (value: unknown) => ParseResult<T[K]>;
};

export const ok = <T>(value: T): ParseOk<T> => ({ ok: true, value });
export const err = (error: string): ParseErr => ({ ok: false, error });

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJsonBody(
  request: Pick<Request, 'json'>,
  error: string,
): Promise<ParseResult<unknown>> {
  try {
    return ok(await request.json());
  } catch {
    return err(error);
  }
}

export async function readJsonRecord(
  request: Pick<Request, 'json'>,
  error: string,
): Promise<ParseResult<Record<string, unknown>>> {
  const body = await readJsonBody(request, error);
  if (!body.ok) return body;
  return isRecord(body.value) ? ok(body.value) : err(error);
}

export function rejectUnknownFields(
  body: Record<string, unknown>,
  allowed: ReadonlyArray<string>,
): ParseResult<void> {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      return err(`Unknown field: ${key}`);
    }
  }
  return ok(undefined);
}

export function parseRequiredFields<T extends object>(
  body: Record<string, unknown>,
  parsers: FieldParsers<T>,
): ParseResult<T> {
  const parsed: Partial<T> = {};
  for (const key of Object.keys(parsers) as Array<keyof T>) {
    const result = parsers[key](body[key as string]);
    if (!result.ok) return result;
    parsed[key] = result.value;
  }
  return ok(parsed as T);
}

export function parsePatchFields<T extends object>(
  body: Record<string, unknown>,
  parsers: FieldParsers<T>,
): ParseResult<Partial<T>> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(parsers) as Array<keyof T>) {
    if (!((key as string) in body)) continue;
    const result = parsers[key](body[key as string]);
    if (!result.ok) return result;
    patch[key] = result.value;
  }
  return ok(patch);
}

export function parseId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_INT32) return null;
  return parsed;
}

export function parseInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export { parseNumber };

export function parseString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

export function parseNonEmptyString(value: unknown): string | null {
  const parsed = parseString(value);
  return parsed ? parsed : null;
}

export function parseDateString(value: unknown): string | null {
  const parsed = parseString(value);
  if (!parsed || !ISO_DATE_REGEX.test(parsed)) return null;
  const candidate = new Date(`${parsed}T00:00:00Z`);
  if (Number.isNaN(candidate.getTime())) return null;
  return toIsoDate(candidate) === parsed ? parsed : null;
}

export function parseCurrencyField(value: unknown): ParseResult<CurrencyCode> {
  return isCurrencyCode(value) ? ok(value) : err('Invalid currency');
}

export function parseBooleanField(value: unknown, error: string): ParseResult<boolean> {
  return typeof value === 'boolean' ? ok(value) : err(error);
}

export function parseOptionalBooleanField(
  value: unknown,
  error: string,
): ParseResult<boolean | null> {
  if (value == null) return ok(null);
  return typeof value === 'boolean' ? ok(value) : err(error);
}

export function parseTextField(value: unknown, error: string): ParseResult<string> {
  const parsed = parseNonEmptyString(value);
  return parsed ? ok(parsed) : err(error);
}

export function parseOptionalTextField(value: unknown, error: string): ParseResult<string | null> {
  if (value == null) return ok(null);
  const parsed = parseString(value);
  return parsed === null ? err(error) : ok(parsed || null);
}

export function parseDateField(value: unknown, error: string): ParseResult<string> {
  const parsed = parseDateString(value);
  return parsed ? ok(parsed) : err(error);
}

export function parseNumberField(
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<number> {
  const parsed = parseNumber(value);
  return parsed === null || parsed < min ? err(error) : ok(parsed);
}

export function parseOptionalNumberField(
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<number | null> {
  if (value == null || value === '') return ok(null);
  const parsed = parseNumber(value);
  return parsed === null || parsed < min ? err(error) : ok(parsed);
}

export function parseIntegerField(
  value: unknown,
  error: string,
  min = Number.MIN_SAFE_INTEGER,
  max = MAX_INT32,
): ParseResult<number> {
  const parsed = parseInteger(value);
  return parsed === null || parsed < min || parsed > max ? err(error) : ok(parsed);
}

export function parseOptionalIntegerField(
  value: unknown,
  error: string,
  min = Number.MIN_SAFE_INTEGER,
  max = MAX_INT32,
): ParseResult<number | null> {
  if (value == null || value === '') return ok(null);
  const parsed = parseInteger(value);
  return parsed === null || parsed < min || parsed > max ? err(error) : ok(parsed);
}

export function parsePositiveNumberField(value: unknown, error: string): ParseResult<number> {
  const parsed = parseNumber(value);
  return parsed === null || parsed <= 0 ? err(error) : ok(parsed);
}

export function parseOptionalDateField(value: unknown, error: string): ParseResult<string | null> {
  if (value == null || value === '') return ok(null);
  const parsed = parseDateString(value);
  return parsed ? ok(parsed) : err(error);
}

export function parseOptionalId(value: unknown): number | null | 'invalid' {
  if (value == null || value === '') return null;
  const parsed = parseId(String(value));
  return parsed === null ? 'invalid' : parsed;
}

const DECIMAL_PATTERN = /^-?(\d+(\.\d+)?|\.\d+)$/;
// `1,500` could be 1500 or 1.5, so a lone comma before exactly three digits is rejected.
const AMBIGUOUS_COMMA_PATTERN = /^-?[1-9]\d{0,2},\d{3}$/;

function stripGroupSeparators(value: string, separator: ',' | '.'): string | null {
  if (!value.includes(separator)) return value;
  const grouped = new RegExp(`^-?\\d{1,3}(\\${separator}\\d{3})+$`);
  return grouped.test(value) ? value.replaceAll(separator, '') : null;
}

function normalizeSingleSeparator(value: string, separator: ',' | '.'): string | null {
  if (value.indexOf(separator) !== value.lastIndexOf(separator)) {
    return stripGroupSeparators(value, separator);
  }
  if (separator === ',' && AMBIGUOUS_COMMA_PATTERN.test(value)) return null;
  return value.replace(separator, '.');
}

function normalizeDecimalString(value: string): string | null {
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  if (lastComma < 0 && lastDot < 0) return value;
  if (lastComma < 0) return normalizeSingleSeparator(value, '.');
  if (lastDot < 0) return normalizeSingleSeparator(value, ',');

  const decimalIndex = Math.max(lastComma, lastDot);
  const integerPart = stripGroupSeparators(
    value.slice(0, decimalIndex),
    decimalIndex === lastComma ? '.' : ',',
  );
  return integerPart === null ? null : `${integerPart}.${value.slice(decimalIndex + 1)}`;
}

// Accepts `1234.56`, `1,234.56`, `1.234,56` and `12,5`. Input where the grouping is malformed
// or the meaning is unclear returns null rather than a silently wrong number.
export function parseNormalizedDecimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, '');
  if (!compact) return null;

  const normalized = normalizeDecimalString(compact);
  if (normalized === null || !DECIMAL_PATTERN.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNormalizedDecimalField(
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<number> {
  const parsed = parseNormalizedDecimal(value);
  return parsed === null || parsed < min ? err(error) : ok(parsed);
}

export function parseOptionalNormalizedDecimalField(
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<number | null> {
  if (value == null || value === '') return ok(null);
  return parseNormalizedDecimalField(value, error, min);
}

// Integers and integral numeric strings such as `"40"`, `"40.0"` or `"4e1"`.
export function parseWholeNumber(value: unknown): number | null {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

export function pickPatchedValue<T, U>(patchValue: T | undefined, existingValue: U): T | U {
  return patchValue === undefined ? existingValue : patchValue;
}

// ── Money (D38) ──────────────────────────────────────────────────────────────

/**
 * Money amounts must stay below this absolute value: below it a cent amount survives the round
 * trip through a JavaScript number exactly (docs/financial-invariants.md).
 */
export const MONEY_LIMIT = 10_000_000_000_000;

export function moneyLimitError(field: string): string {
  return `${field} is out of range: money amounts must be below 10,000,000,000,000`;
}

/**
 * The money input rule for an already parsed number: round to cents half away from zero, as
 * `numeric(19,2)` stores it, and refuse an absolute value of 10^13 or more. Unit prices, share
 * quantities, FX and interest rates and percentages are not money and never go through this.
 */
export function toMoneyAmount(value: number, field: string): ParseResult<number> {
  const amount = roundMoney(value);
  return Math.abs(amount) >= MONEY_LIMIT ? err(moneyLimitError(field)) : ok(amount);
}

export type MoneyFieldOptions = {
  /** The request field, named in the out-of-range error. */
  field: string;
  /** Answer for a missing, unparsable or below-minimum value. */
  error: string;
  /** Smallest accepted amount after rounding; `Number.MIN_VALUE` means greater than zero. */
  min?: number;
  /** Accept localized decimal text such as `1.234,56` (see `parseNormalizedDecimal`). */
  localized?: boolean;
};

export function parseMoneyField(value: unknown, options: MoneyFieldOptions): ParseResult<number> {
  const parsed = options.localized ? parseNormalizedDecimal(value) : parseNumber(value);
  if (parsed === null) return err(options.error);
  const amount = toMoneyAmount(parsed, options.field);
  if (!amount.ok) return amount;
  return amount.value < (options.min ?? Number.NEGATIVE_INFINITY) ? err(options.error) : amount;
}

export function parseOptionalMoneyField(
  value: unknown,
  options: MoneyFieldOptions,
): ParseResult<number | null> {
  if (value == null || value === '') return ok(null);
  return parseMoneyField(value, options);
}
