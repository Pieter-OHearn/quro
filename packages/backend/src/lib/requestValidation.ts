import { isCurrencyCode, type CurrencyCode } from '@quro/shared';

const MAX_INT32 = 2_147_483_647;
const ISO_DATE_LENGTH = 10;
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

export function rejectUnknownFields(
  body: Record<string, unknown>,
  allowed: ReadonlyArray<string>,
): ParseResult<void> {
  const allowedKeys = new Set(['userId', ...allowed]);
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

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

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
  return candidate.toISOString().slice(0, ISO_DATE_LENGTH) === parsed ? parsed : null;
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
