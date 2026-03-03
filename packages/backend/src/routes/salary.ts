import { Hono } from 'hono';
import { db } from '../db/client';
import { payslips } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';

const app = new Hono();
type CurrencyCode = 'EUR' | 'GBP' | 'USD' | 'AUD' | 'NZD' | 'CAD' | 'CHF' | 'SGD';
const MAX_INT32 = 2_147_483_647;
const DATE_YEAR_LENGTH = 4;
const ISO_DATE_LENGTH = 10;
const DECIMAL_RADIX = 10;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODES = ['EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'SGD'] as const;
const CURRENCY_SET = new Set<CurrencyCode>(CURRENCY_CODES);

type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; error: string };
type ParseResult<T> = ParseOk<T> | ParseErr;
type FieldParsers<T extends object> = {
  [K in keyof T]: (value: unknown) => ParseResult<T[K]>;
};

type PayslipInput = {
  month: string;
  date: string;
  gross: string;
  tax: string;
  pension: string;
  net: string;
  bonus: string | null;
  currency: CurrencyCode;
};

const PAYSLIP_FIELDS = [
  'month',
  'date',
  'gross',
  'tax',
  'pension',
  'net',
  'bonus',
  'currency',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseId(raw: string): number | null {
  const parsed = Number.parseInt(raw, DECIMAL_RADIX);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_INT32) return null;
  return parsed;
}

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const parseDateString = (value: unknown): string | null => {
  const parsed = parseString(value);
  if (!parsed || !ISO_DATE_REGEX.test(parsed)) return null;
  const candidate = new Date(`${parsed}T00:00:00Z`);
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate.toISOString().slice(0, ISO_DATE_LENGTH) === parsed ? parsed : null;
};

function parseCurrency(value: unknown): CurrencyCode | null {
  if (typeof value !== 'string' || !CURRENCY_SET.has(value as CurrencyCode)) return null;
  return value as CurrencyCode;
}

function rejectUnknownFields(
  body: Record<string, unknown>,
  allowed: ReadonlyArray<string>,
): ParseResult<void> {
  const allowedKeys = new Set(['userId', ...allowed]);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unknown field: ${key}` };
    }
  }
  return { ok: true, value: undefined };
}

const ok = <T>(value: T): ParseOk<T> => ({ ok: true, value });
const err = (error: string): ParseErr => ({ ok: false, error });

function parseRequiredFields<T extends object>(
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

function parsePatchFields<T extends object>(
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

const parseTextField = (value: unknown, error: string): ParseResult<string> => {
  const parsed = parseString(value);
  return parsed ? ok(parsed) : err(error);
};

const parseDateField = (value: unknown, error: string): ParseResult<string> => {
  const parsed = parseDateString(value);
  return parsed ? ok(parsed) : err(error);
};

const parseNumericStringField = (
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<string> => {
  const parsed = parseNumber(value);
  if (parsed === null || parsed < min) return err(error);
  return ok(parsed.toString());
};

const parseNullableNumericStringField = (
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<string | null> => {
  if (value == null) return ok(null);
  const parsed = parseNumber(value);
  if (parsed === null || parsed < min) return err(error);
  return ok(parsed.toString());
};

const parseCurrencyField = (value: unknown): ParseResult<CurrencyCode> => {
  const currency = parseCurrency(value);
  return currency ? ok(currency) : err('Invalid currency');
};

const payslipFieldParsers: FieldParsers<PayslipInput> = {
  month: (value) => parseTextField(value, 'Invalid month'),
  date: (value) => parseDateField(value, 'Invalid date (expected YYYY-MM-DD)'),
  gross: (value) => parseNumericStringField(value, 'Invalid gross', 0),
  tax: (value) => parseNumericStringField(value, 'Invalid tax', 0),
  pension: (value) => parseNumericStringField(value, 'Invalid pension', 0),
  net: (value) => parseNumericStringField(value, 'Invalid net'),
  bonus: (value) => parseNullableNumericStringField(value, 'Invalid bonus', 0),
  currency: parseCurrencyField,
};

function parsePayslipCreate(body: unknown): ParseResult<PayslipInput> {
  if (!isRecord(body)) return err('Invalid payslip payload');
  const strictCheck = rejectUnknownFields(body, PAYSLIP_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parseRequiredFields(body, payslipFieldParsers);
}

function parsePayslipPatch(body: unknown): ParseResult<Partial<PayslipInput>> {
  if (!isRecord(body)) return err('Invalid payslip payload');
  const strictCheck = rejectUnknownFields(body, PAYSLIP_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, payslipFieldParsers);
}

// ── Payslips ─────────────────────────────────────────────────────────────────

app.get('/payslips', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(payslips).where(eq(payslips.userId, user.id));
  return c.json({ data });
});

app.get('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(payslips)
    .where(and(eq(payslips.id, id), eq(payslips.userId, user.id)));
  if (!data) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/payslips', async (c) => {
  const user = getAuthUser(c);
  const body = parsePayslipCreate(await c.req.json());
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .insert(payslips)
    .values({ ...body.value, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);
  const body = parsePayslipPatch(await c.req.json());
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No payslip fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }
  const [data] = await db
    .update(payslips)
    .set(body.value)
    .where(and(eq(payslips.id, id), eq(payslips.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(payslips)
    .where(and(eq(payslips.id, id), eq(payslips.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Salary History ───────────────────────────────────────────────────────────

app.get('/history', async (c) => {
  const user = getAuthUser(c);
  const data = await db
    .select({
      date: payslips.date,
      gross: payslips.gross,
      currency: payslips.currency,
    })
    .from(payslips)
    .where(eq(payslips.userId, user.id));

  const annualSalaryByYearAndCurrency = new Map<
    string,
    { year: number; annualSalary: number; currency: CurrencyCode }
  >();

  for (const payslip of data) {
    const year = Number.parseInt(payslip.date.slice(0, DATE_YEAR_LENGTH), DECIMAL_RADIX);
    if (!Number.isInteger(year)) continue;

    const gross = parseNumber(payslip.gross) ?? 0;
    const key = `${year}:${payslip.currency}`;
    const existing = annualSalaryByYearAndCurrency.get(key);

    if (existing) {
      existing.annualSalary += gross;
      continue;
    }

    annualSalaryByYearAndCurrency.set(key, {
      year,
      annualSalary: gross,
      currency: payslip.currency,
    });
  }

  const history = [...annualSalaryByYearAndCurrency.values()]
    .sort((left, right) => left.year - right.year || left.currency.localeCompare(right.currency))
    .map((entry, index) => ({
      id: index + 1,
      year: entry.year,
      annualSalary: entry.annualSalary.toString(),
      currency: entry.currency,
    }));

  return c.json({ data: history });
});

export default app;
