import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { payslips } from '../db/schema';
import { HTTP_STATUS } from '../constants/http';
import { getAuthUser } from '../lib/authUser';
import {
  asFile,
  buildPdfStorageKey,
  deleteStoredPdfSafely,
  formatInlinePdfDocument,
  isS3NotFoundError,
  type InlinePdfDocumentResponse,
  PDF_MIME_TYPE,
  readInlinePdfDocument,
  uploadPdfFile,
  validateUploadedPdf,
} from '../lib/pdfDocuments';
import { getS3ObjectBytes } from '../lib/s3';

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

type PayslipRow = typeof payslips.$inferSelect;

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
  tax: (value) => parseNumericStringField(value, 'Invalid tax'),
  pension: (value) => parseNumericStringField(value, 'Invalid pension'),
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

function formatPayslipResponse(row: PayslipRow) {
  return {
    id: row.id,
    month: row.month,
    date: row.date,
    gross: row.gross,
    tax: row.tax,
    pension: row.pension,
    net: row.net,
    bonus: row.bonus,
    currency: row.currency,
    document: formatInlinePdfDocument(row),
  };
}

async function getOwnedPayslip(userId: number, payslipId: number): Promise<PayslipRow | null> {
  const [payslipRow] = await db
    .select()
    .from(payslips)
    .where(and(eq(payslips.id, payslipId), eq(payslips.userId, userId)));

  return payslipRow ?? null;
}

type UploadPayslipDocumentResult =
  | { ok: true; document: InlinePdfDocumentResponse }
  | { ok: false; error: string; status: (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS] };

async function persistPayslipDocumentMetadata(params: {
  userId: number;
  payslipId: number;
  storageKey: string;
  uploaded: Awaited<ReturnType<typeof uploadPdfFile>>;
  previousDocument: ReturnType<typeof readInlinePdfDocument>;
}): Promise<UploadPayslipDocumentResult> {
  try {
    const [updated] = await db
      .update(payslips)
      .set({
        documentStorageKey: params.storageKey,
        documentFileName: params.uploaded.fileName,
        documentSizeBytes: params.uploaded.sizeBytes,
        documentUploadedAt: params.uploaded.uploadedAt,
      })
      .where(and(eq(payslips.id, params.payslipId), eq(payslips.userId, params.userId)))
      .returning();

    if (!updated) {
      await deleteStoredPdfSafely(params.storageKey, 'payslip PDF');
      return { ok: false, error: 'Payslip not found', status: HTTP_STATUS.NOT_FOUND };
    }

    if (params.previousDocument && params.previousDocument.storageKey !== params.storageKey) {
      await deleteStoredPdfSafely(params.previousDocument.storageKey, 'payslip PDF');
    }

    const document = formatInlinePdfDocument(updated);
    if (!document) {
      await deleteStoredPdfSafely(params.storageKey, 'payslip PDF');
      return {
        ok: false,
        error: 'Failed to save payslip PDF',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      };
    }

    return { ok: true, document };
  } catch (error) {
    await deleteStoredPdfSafely(params.storageKey, 'payslip PDF');
    console.error('Failed to save payslip PDF metadata', error);
    return {
      ok: false,
      error: 'Failed to save payslip PDF',
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    };
  }
}

async function uploadPayslipDocumentForUser(params: {
  userId: number;
  payslipId: number;
  file: File;
}): Promise<UploadPayslipDocumentResult> {
  const existingPayslip = await getOwnedPayslip(params.userId, params.payslipId);
  if (!existingPayslip) {
    return { ok: false, error: 'Payslip not found', status: HTTP_STATUS.NOT_FOUND };
  }

  const previousDocument = readInlinePdfDocument(existingPayslip);
  const storageKey = buildPdfStorageKey({
    userId: params.userId,
    pathSegments: ['salary', 'payslips', params.payslipId],
  });
  const uploaded = await uploadPdfFile({
    key: storageKey,
    file: params.file,
    fallbackBaseName: 'payslip',
  }).catch((error: unknown) => {
    console.error('Failed to upload payslip PDF to storage', error);
    return null;
  });

  if (!uploaded) {
    return {
      ok: false,
      error: 'Failed to upload payslip PDF',
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    };
  }

  return persistPayslipDocumentMetadata({
    userId: params.userId,
    payslipId: params.payslipId,
    storageKey,
    uploaded,
    previousDocument,
  });
}

// ── Payslips ─────────────────────────────────────────────────────────────────

app.get('/payslips', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(payslips).where(eq(payslips.userId, user.id));
  return c.json({ data: data.map(formatPayslipResponse) });
});

app.get('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);

  const data = await getOwnedPayslip(user.id, id);
  if (!data) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);

  return c.json({ data: formatPayslipResponse(data) });
});

app.post('/payslips', async (c) => {
  const user = getAuthUser(c);
  const body = parsePayslipCreate(await c.req.json());
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .insert(payslips)
    .values({ ...body.value, userId: user.id })
    .returning();

  return c.json({ data: formatPayslipResponse(data) }, HTTP_STATUS.CREATED);
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
  return c.json({ data: formatPayslipResponse(data) });
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

  const existingDocument = readInlinePdfDocument(data);
  if (existingDocument) {
    await deleteStoredPdfSafely(existingDocument.storageKey, 'payslip PDF');
  }

  return c.json({ data: formatPayslipResponse(data) });
});

app.post('/payslips/:id/document', async (c) => {
  const user = getAuthUser(c);
  const payslipId = parseId(c.req.param('id'));
  if (payslipId === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);

  const formData = await c.req.formData();
  const file = asFile(formData.get('file'));
  if (!file) return c.json({ error: 'A PDF file is required' }, HTTP_STATUS.BAD_REQUEST);

  const validation = validateUploadedPdf(file);
  if (!validation.valid) return c.json({ error: validation.error }, HTTP_STATUS.BAD_REQUEST);

  const result = await uploadPayslipDocumentForUser({
    userId: user.id,
    payslipId,
    file,
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.document }, HTTP_STATUS.CREATED);
});

app.get('/payslips/:id/document/download', async (c) => {
  const user = getAuthUser(c);
  const payslipId = parseId(c.req.param('id'));
  if (payslipId === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);

  const payslipRow = await getOwnedPayslip(user.id, payslipId);
  if (!payslipRow) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);

  const document = readInlinePdfDocument(payslipRow);
  if (!document) return c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);

  try {
    const bytes = await getS3ObjectBytes({ key: document.storageKey });
    if (!bytes) return c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);

    c.header('Content-Type', PDF_MIME_TYPE);
    c.header('Content-Disposition', `inline; filename="${document.fileName}"`);
    return c.body(bytes);
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);
    }

    console.error('Failed to download payslip PDF', error);
    return c.json({ error: 'Failed to download payslip PDF' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
});

app.delete('/payslips/:id/document', async (c) => {
  const user = getAuthUser(c);
  const payslipId = parseId(c.req.param('id'));
  if (payslipId === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);

  const existingPayslip = await getOwnedPayslip(user.id, payslipId);
  if (!existingPayslip) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);

  const deletedDocument = readInlinePdfDocument(existingPayslip);
  if (!deletedDocument) return c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);

  await db
    .update(payslips)
    .set({
      documentStorageKey: null,
      documentFileName: null,
      documentSizeBytes: null,
      documentUploadedAt: null,
    })
    .where(and(eq(payslips.id, payslipId), eq(payslips.userId, user.id)));

  await deleteStoredPdfSafely(deletedDocument.storageKey, 'payslip PDF');
  return c.json({ data: formatInlinePdfDocument(existingPayslip) });
});

// ── Salary History ───────────────────────────────────────────────────────────

app.get('/history', async (c) => {
  const user = getAuthUser(c);
  const data = await db
    .select({
      date: payslips.date,
      gross: payslips.gross,
      bonus: payslips.bonus,
      currency: payslips.currency,
    })
    .from(payslips)
    .where(eq(payslips.userId, user.id));

  const annualSalaryByYearAndCurrency = new Map<
    string,
    { year: number; annualSalary: number; currency: CurrencyCode }
  >();

  for (const payslipRow of data) {
    const year = Number.parseInt(payslipRow.date.slice(0, DATE_YEAR_LENGTH), DECIMAL_RADIX);
    if (!Number.isInteger(year)) continue;

    const gross = (parseNumber(payslipRow.gross) ?? 0) + (parseNumber(payslipRow.bonus) ?? 0);
    const key = `${year}:${payslipRow.currency}`;
    const existing = annualSalaryByYearAndCurrency.get(key);

    if (existing) {
      existing.annualSalary += gross;
      continue;
    }

    annualSalaryByYearAndCurrency.set(key, {
      year,
      annualSalary: gross,
      currency: payslipRow.currency,
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
