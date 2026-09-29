import { Hono } from 'hono';
import { and, eq, gte, isNull, or } from 'drizzle-orm';
import type { CurrencyCode } from '@quro/shared';
import { db } from '../db/client';
import { employments, payslips } from '../db/schema';
import { HTTP_STATUS } from '../constants/http';
import { getAuthUser } from '../lib/authUser';
import { earliestDate, invalidateSnapshotsFrom } from '../lib/netWorth';
import {
  asFile,
  buildPdfStorageKey,
  CLEAR_INLINE_PDF_DOCUMENT,
  deleteStoredPdfSafely,
  formatInlinePdfDocument,
  isS3NotFoundError,
  type InlinePdfDocumentResponse,
  PDF_MIME_TYPE,
  readInlinePdfDocument,
  uploadPdfFile,
  validateUploadedPdf,
} from '../lib/pdfDocuments';
import {
  err,
  type FieldParsers,
  isRecord,
  parseCurrencyField,
  parseDateField,
  parseId,
  parseNumber,
  parseNumberField,
  parseOptionalIntegerField,
  parseOptionalNumberField,
  parsePatchFields,
  parseRequiredFields,
  type ParseResult,
  parseTextField,
  readJsonBody,
  rejectUnknownFields,
} from '../lib/requestValidation';
import { getS3ObjectBytes } from '../lib/s3';

const app = new Hono();

const DATE_YEAR_LENGTH = 4;
const ISO_DATE_LENGTH = 10;
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

const payslipFieldParsers: FieldParsers<PayslipInput> = {
  employmentId: (value) => parseOptionalIntegerField(value, 'Invalid employment', 1),
  month: (value) => parseTextField(value, 'Invalid month'),
  date: (value) => parseDateField(value, 'Invalid date (expected YYYY-MM-DD)'),
  gross: (value) => parseNumberField(value, 'Invalid gross', 0),
  tax: (value) => parseNumberField(value, 'Invalid tax', 0),
  pension: (value) => parseNumberField(value, 'Invalid pension', 0),
  net: (value) => parseNumberField(value, 'Invalid net', 0),
  bonus: (value) => parseOptionalNumberField(value, 'Invalid bonus', 0),
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
  const today = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
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
  const rawBody = await readJsonBody(c.req, 'Invalid payslip payload');
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
    await invalidateSnapshotsFrom(tx, user.id, body.value.date);
    return [created];
  });

  return c.json({ data: formatPayslipResponse(data) }, HTTP_STATUS.CREATED);
});

app.patch('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid payslip id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid payslip payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePayslipPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No payslip fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }
  const existing = await getOwnedPayslip(user.id, id);
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
    await invalidateSnapshotsFrom(
      tx,
      user.id,
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
    if (deleted) await invalidateSnapshotsFrom(tx, user.id, deleted.date);
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

  const payslipRow = await getOwnedPayslip(user.id, payslipId);
  if (!payslipRow) return c.json({ error: 'Payslip not found' }, HTTP_STATUS.NOT_FOUND);

  const document = readInlinePdfDocument(payslipRow);
  if (!document) return c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);

  try {
    const bytes = await getS3ObjectBytes({ key: document.storageKey });
    if (!bytes) return c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);

    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': PDF_MIME_TYPE,
        'Content-Disposition': `inline; filename="${document.fileName}"`,
      },
    });
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
