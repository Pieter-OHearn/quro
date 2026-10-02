import { findOwnedRow } from '../lib/access';
import { Hono } from 'hono';
import { and, eq, gte, isNull, or } from 'drizzle-orm';
import { toIsoDate, type CurrencyCode } from '@quro/shared';
import { db } from '../db/client';
import { employments, payslips } from '../db/schema';
import { HTTP_STATUS } from '../constants/http';
import { getAuthUser } from '../lib/authUser';
import { earliestDate } from '../lib/netWorth';
import { withLedgerWrite } from '../lib/ledgerWrite';
import {
  asFile,
  buildPdfStorageKey,
  CLEAR_INLINE_PDF_DOCUMENT,
  deleteStoredPdfSafely,
  formatInlinePdfDocument,
  type InlinePdfDocumentResponse,
  readInlinePdfDocument,
  replaceStoredPdfDocument,
  type ReplaceStoredPdfResult,
  streamStoredPdf,
  validateUploadedPdf,
} from '../lib/pdfDocuments';
import {
  err,
  type FieldParsers,
  ok,
  parseCurrencyField,
  parseDateField,
  parseId,
  parseNumberField,
  parsePatchFields,
  parseRequiredFields,
  type ParseResult,
  parseTextField,
  parseWholeNumber,
  readJsonRecord,
  rejectUnknownFields,
} from '../lib/requestValidation';
import { toNumberOrZero } from '../lib/numbers';

const app = new Hono();

const DATE_YEAR_LENGTH = 4;
const DECIMAL_RADIX = 10;

type PayslipInput = {
  employmentId: number | null;
  month: string;
  date: string;
  gross: number;
  tax: number;
  pension: number;
  net: number;
  bonus: number | null;
  currency: CurrencyCode;
};

type PayslipRow = typeof payslips.$inferSelect;

const PAYSLIP_FIELDS = [
  'employmentId',
  'month',
  'date',
  'gross',
  'tax',
  'pension',
  'net',
  'bonus',
  'currency',
] as const;

function parseEmploymentIdField(value: unknown): ParseResult<number | null> {
  if (value == null || value === '') return ok(null);
  const parsed = parseWholeNumber(value);
  return parsed !== null && parsed > 0 ? ok(parsed) : err('Invalid employment');
}

const payslipFieldParsers: FieldParsers<PayslipInput> = {
  employmentId: parseEmploymentIdField,
  month: (value) => parseTextField(value, 'Invalid month'),
  date: (value) => parseDateField(value, 'Invalid date (expected YYYY-MM-DD)'),
  gross: (value) => parseNumberField(value, 'Invalid gross', 0),
  tax: (value) => parseNumberField(value, 'Invalid tax', 0),
  pension: (value) => parseNumberField(value, 'Invalid pension', 0),
  net: (value) => parseNumberField(value, 'Invalid net', 0),
  bonus: (value) => (value == null ? ok(null) : parseNumberField(value, 'Invalid bonus', 0)),
  currency: parseCurrencyField,
};

function parsePayslipCreate(body: Record<string, unknown>): ParseResult<PayslipInput> {
  const strictCheck = rejectUnknownFields(body, PAYSLIP_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parseRequiredFields(body, payslipFieldParsers);
}

function parsePayslipPatch(body: Record<string, unknown>): ParseResult<Partial<PayslipInput>> {
  const strictCheck = rejectUnknownFields(body, PAYSLIP_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, payslipFieldParsers);
}

function formatPayslipResponse(row: PayslipRow) {
  return {
    id: row.id,
    employmentId: row.employmentId,
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

async function resolveEmploymentId(
  userId: number,
  requestedId: number | null | undefined,
  autoLink: boolean,
): Promise<{ ok: true; value: number | null } | { ok: false }> {
  if (requestedId !== null && requestedId !== undefined) {
    const [owned] = await db
      .select({ id: employments.id })
      .from(employments)
      .where(and(eq(employments.id, requestedId), eq(employments.userId, userId)));
    return owned ? { ok: true, value: owned.id } : { ok: false };
  }
  if (!autoLink) return { ok: true, value: null };
  const today = toIsoDate(new Date());
  const active = await db
    .select({ id: employments.id })
    .from(employments)
    .where(
      and(
        eq(employments.userId, userId),
        or(isNull(employments.endDate), gte(employments.endDate, today)),
      ),
    );
  return { ok: true, value: active.length === 1 ? active[0].id : null };
}

async function uploadPayslipDocumentForUser(params: {
  userId: number;
  payslipId: number;
  file: File;
}): Promise<ReplaceStoredPdfResult<InlinePdfDocumentResponse>> {
  const existingPayslip = await findOwnedRow(payslips, params.payslipId, params.userId);
  if (!existingPayslip) {
    return { ok: false, error: 'Payslip not found', status: HTTP_STATUS.NOT_FOUND };
  }

  return replaceStoredPdfDocument({
    storageKey: buildPdfStorageKey({
      userId: params.userId,
      pathSegments: ['salary', 'payslips', params.payslipId],
    }),
    file: params.file,
    fallbackBaseName: 'payslip',
    context: 'payslip PDF',
    previousDocument: readInlinePdfDocument(existingPayslip),
    persist: async (fields) => {
      const [updated] = await db
        .update(payslips)
        .set(fields)
        .where(and(eq(payslips.id, params.payslipId), eq(payslips.userId, params.userId)))
        .returning();
      return updated;
    },
    formatRow: formatInlinePdfDocument,
    errors: {
      notFound: 'Payslip not found',
      uploadFailed: 'Failed to upload payslip PDF',
      saveFailed: 'Failed to save payslip PDF',
    },
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

  const data = await findOwnedRow(payslips, id, user.id);
  if (!data) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);

  return c.json({ data: formatPayslipResponse(data) });
});

app.post('/payslips', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonRecord(c.req, 'Invalid payslip payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePayslipCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const employment = await resolveEmploymentId(user.id, body.value.employmentId, true);
  if (!employment.ok) return c.json({ error: 'Employment not found' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(payslips)
      .values({ ...body.value, employmentId: employment.value, userId: user.id })
      .returning();
    await withLedgerWrite(tx, { userId: user.id }, body.value.date);
    return [created];
  });

  return c.json({ data: formatPayslipResponse(data) }, HTTP_STATUS.CREATED);
});

app.patch('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonRecord(c.req, 'Invalid payslip payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePayslipPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No payslip fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }
  const existing = await findOwnedRow(payslips, id, user.id);
  if (!existing) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);
  if ('employmentId' in body.value) {
    const employment = await resolveEmploymentId(user.id, body.value.employmentId, false);
    if (!employment.ok) return c.json({ error: 'Employment not found' }, HTTP_STATUS.BAD_REQUEST);
    body.value.employmentId = employment.value;
  }

  const [data] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(payslips)
      .set(body.value)
      .where(and(eq(payslips.id, id), eq(payslips.userId, user.id)))
      .returning();
    await withLedgerWrite(
      tx,
      { userId: user.id },
      earliestDate(existing.date, body.value.date ?? existing.date),
    );
    return [updated];
  });

  if (!data) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data: formatPayslipResponse(data) });
});

app.delete('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(payslips)
      .where(and(eq(payslips.id, id), eq(payslips.userId, user.id)))
      .returning();
    if (deleted) await withLedgerWrite(tx, { userId: user.id }, deleted.date);
    return [deleted];
  });

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

  const payslipRow = await findOwnedRow(payslips, payslipId, user.id);
  if (!payslipRow) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);

  const document = readInlinePdfDocument(payslipRow);
  if (!document) return c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);

  return streamStoredPdf(c, {
    document,
    context: 'payslip PDF',
    failureMessage: 'Failed to download payslip PDF',
  });
});

app.delete('/payslips/:id/document', async (c) => {
  const user = getAuthUser(c);
  const payslipId = parseId(c.req.param('id'));
  if (payslipId === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);

  const existingPayslip = await findOwnedRow(payslips, payslipId, user.id);
  if (!existingPayslip) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);

  const deletedDocument = readInlinePdfDocument(existingPayslip);
  if (!deletedDocument) return c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);

  await db
    .update(payslips)
    .set(CLEAR_INLINE_PDF_DOCUMENT)
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

    const gross = toNumberOrZero(payslipRow.gross) + toNumberOrZero(payslipRow.bonus);
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
