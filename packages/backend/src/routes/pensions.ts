import { Hono } from 'hono';
import type { CurrencyCode } from '@quro/shared';
import { db } from '../db/client';
import { pensionPots, pensionTransactions } from '../db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';
import { getS3ObjectBytes } from '../lib/s3';
import {
  asFile,
  buildPdfStorageKey,
  CLEAR_INLINE_PDF_DOCUMENT,
  deleteStoredPdfSafely,
  isS3NotFoundError,
  PDF_MIME_TYPE,
  readInlinePdfDocument,
  uploadPdfFile,
  validateUploadedPdf,
} from '../lib/pdfDocuments';
import {
  err,
  isRecord,
  ok,
  parseCurrencyField,
  parseDateString,
  parseId,
  parseNumberField,
  parseOptionalTextField,
  parsePatchFields,
  parseRequiredFields,
  parseTextField,
  readJsonBody,
  rejectUnknownFields,
  type FieldParsers,
  type ParseResult,
} from '../lib/requestValidation';

const app = new Hono();
const TRANSACTION_TYPES = ['contribution', 'fee', 'annual_statement'] as const;
const PENSION_POT_FIELDS = [
  'name',
  'provider',
  'type',
  'balance',
  'currency',
  'employeeMonthly',
  'employerMonthly',
  'investmentStrategy',
  'metadata',
  'color',
  'emoji',
  'notes',
] as const;
const PENSION_TRANSACTION_FIELDS = [
  'potId',
  'type',
  'amount',
  'taxAmount',
  'date',
  'note',
  'isEmployer',
] as const;

type PensionTransactionType = (typeof TRANSACTION_TYPES)[number];

type PensionPotPayload = {
  name: string;
  provider: string;
  type: string;
  balance: number;
  currency: CurrencyCode;
  employeeMonthly: number;
  employerMonthly: number;
  investmentStrategy: string | null;
  metadata: Record<string, string>;
  color: string | null;
  emoji: string | null;
  notes: string | null;
};

type NormalizedPensionTransactionPayload = {
  potId: number;
  type: PensionTransactionType;
  amount: number;
  taxAmount: number;
  date: string;
  note: string;
  isEmployer: boolean | null;
};

type RawPensionTransactionPayload = {
  potId: unknown;
  type: unknown;
  amount: unknown;
  taxAmount: unknown;
  date: unknown;
  note: unknown;
  isEmployer: unknown;
};

type ParsedPensionTransactionPayloadBase = {
  potId: number;
  type: PensionTransactionType;
  amount: number;
  taxAmount: number;
  date: string;
  note: string;
  isEmployer: unknown;
};

type PensionStatementDocumentRecord = {
  id: number;
  transactionId: number;
  potId: number;
  storageKey: string;
  fileName: string;
  mimeType: typeof PDF_MIME_TYPE;
  sizeBytes: number;
  uploadedAt: Date;
};

type ValidationResult =
  | { ok: true; data: NormalizedPensionTransactionPayload }
  | { ok: false; error: string };

type RouteMutationResult =
  | { data: unknown }
  | { error: string; status: (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS] };

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isMetadataPrimitive(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function parseMetadataField(value: unknown): ParseResult<Record<string, string>> {
  if (value == null) return ok({});
  if (!isRecord(value)) return err('Metadata must be an object');
  if (Object.keys(value).length > 50) return err('Too many metadata keys');

  const metadata: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key || rawValue == null) continue;

    if (key.length > 100) return err('Metadata key exceeds size limit');
    if (!isMetadataPrimitive(rawValue))
      return err('Metadata values must be strings, numbers, or booleans');

    const strVal = String(rawValue).trim();
    if (strVal.length > 1000) return err('Metadata value exceeds size limit');
    metadata[key] = strVal;
  }

  return ok(metadata);
}

const pensionPotParsers: FieldParsers<PensionPotPayload> = {
  name: (value) => parseTextField(value, 'Pension name is required'),
  provider: (value) => parseTextField(value, 'Provider is required'),
  type: (value) => parseTextField(value, 'Pension type is required'),
  balance: (value) => parseNumberField(value, 'Balance must be zero or greater', 0),
  currency: parseCurrencyField,
  employeeMonthly: (value) =>
    parseNumberField(value, 'Employee contribution must be zero or greater', 0),
  employerMonthly: (value) =>
    parseNumberField(value, 'Employer contribution must be zero or greater', 0),
  investmentStrategy: (value) =>
    parseOptionalTextField(value, 'Investment strategy must be a string'),
  metadata: parseMetadataField,
  color: (value) => parseOptionalTextField(value, 'Color must be a string'),
  emoji: (value) => parseOptionalTextField(value, 'Emoji must be a string'),
  notes: (value) => parseOptionalTextField(value, 'Notes must be a string'),
};

function toPensionTransactionInsertPayload(
  payload: NormalizedPensionTransactionPayload,
  userId: number,
): typeof pensionTransactions.$inferInsert {
  return {
    userId,
    potId: payload.potId,
    type: payload.type,
    amount: payload.amount.toString(),
    taxAmount: payload.taxAmount.toString(),
    date: payload.date,
    note: payload.note,
    isEmployer: payload.isEmployer,
  };
}

function toPensionPotInsertPayload(
  payload: PensionPotPayload,
  userId: number,
): typeof pensionPots.$inferInsert {
  return {
    userId,
    name: payload.name,
    provider: payload.provider,
    type: payload.type,
    balance: payload.balance.toString(),
    currency: payload.currency,
    employeeMonthly: payload.employeeMonthly.toString(),
    employerMonthly: payload.employerMonthly.toString(),
    investmentStrategy: payload.investmentStrategy,
    metadata: payload.metadata,
    color: payload.color,
    emoji: payload.emoji,
    notes: payload.notes,
  };
}

function toPensionPotUpdatePayload(
  payload: Partial<PensionPotPayload>,
): Partial<typeof pensionPots.$inferInsert> {
  return {
    name: payload.name,
    provider: payload.provider,
    type: payload.type,
    balance: payload.balance?.toString(),
    currency: payload.currency,
    employeeMonthly: payload.employeeMonthly?.toString(),
    employerMonthly: payload.employerMonthly?.toString(),
    investmentStrategy: payload.investmentStrategy,
    metadata: payload.metadata,
    color: payload.color,
    emoji: payload.emoji,
    notes: payload.notes,
  };
}

function toPensionTransactionUpdatePayload(
  payload: NormalizedPensionTransactionPayload,
): Partial<typeof pensionTransactions.$inferInsert> {
  return {
    potId: payload.potId,
    type: payload.type,
    amount: payload.amount.toString(),
    taxAmount: payload.taxAmount.toString(),
    date: payload.date,
    note: payload.note,
    isEmployer: payload.isEmployer,
  };
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePensionTransactionType(value: unknown): PensionTransactionType | null {
  if (typeof value !== 'string') return null;
  return TRANSACTION_TYPES.includes(value as PensionTransactionType)
    ? (value as PensionTransactionType)
    : null;
}

function parsePensionPotCreate(body: unknown): ParseResult<PensionPotPayload> {
  if (!isRecord(body)) return err('Invalid pension pot payload');
  const strictCheck = rejectUnknownFields(body, PENSION_POT_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parseRequiredFields(body, pensionPotParsers);
}

function parsePensionPotPatch(body: unknown): ParseResult<Partial<PensionPotPayload>> {
  if (!isRecord(body)) return err('Invalid pension pot payload');
  const strictCheck = rejectUnknownFields(body, PENSION_POT_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, pensionPotParsers);
}

function extractTransactionBodyFields(body: Record<string, unknown>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const field of PENSION_TRANSACTION_FIELDS) {
    if (field in body) raw[field] = body[field];
  }
  return raw;
}

function parsePensionTransactionCreate(
  body: unknown,
): ParseResult<NormalizedPensionTransactionPayload> {
  if (!isRecord(body)) return err('Invalid pension transaction payload');
  const strictCheck = rejectUnknownFields(body, PENSION_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const validated = validatePensionTransactionPayload({
    potId: body.potId,
    type: body.type,
    amount: body.amount,
    taxAmount: body.taxAmount ?? 0,
    date: body.date,
    note: body.note,
    isEmployer: body.isEmployer,
  });
  return validated.ok ? ok(validated.data) : err(validated.error);
}

function parsePensionTransactionPatch(body: unknown): ParseResult<Record<string, unknown>> {
  if (!isRecord(body)) return err('Invalid pension transaction payload');
  const strictCheck = rejectUnknownFields(body, PENSION_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return ok(extractTransactionBodyFields(body));
}

function buildPensionDocumentStorageKey(params: {
  userId: number;
  potId: number;
  transactionId: number;
}): string {
  return buildPdfStorageKey({
    userId: params.userId,
    pathSegments: ['pensions', params.potId, 'annual-statements', params.transactionId],
  });
}

function parsePensionTransactionPayloadBase(
  rawPayload: RawPensionTransactionPayload,
): { ok: true; data: ParsedPensionTransactionPayloadBase } | { ok: false; error: string } {
  const potId = parseId(String(rawPayload.potId ?? ''));
  if (potId === null) return { ok: false, error: 'Invalid pension pot id' };

  const type = parsePensionTransactionType(rawPayload.type);
  if (!type) return { ok: false, error: 'Invalid transaction type' };

  const amount = toFiniteNumber(rawPayload.amount);
  if (amount === null) return { ok: false, error: 'Invalid transaction amount' };

  const taxAmount = toFiniteNumber(rawPayload.taxAmount ?? 0);
  if (taxAmount === null) return { ok: false, error: 'Invalid tax amount' };

  const date = parseDateString(rawPayload.date);
  if (!date) return { ok: false, error: 'Invalid transaction date' };

  return {
    ok: true,
    data: {
      potId,
      type,
      amount,
      taxAmount,
      date,
      note: typeof rawPayload.note === 'string' ? rawPayload.note : '',
      isEmployer: rawPayload.isEmployer,
    },
  };
}

function validateContributionPayload(base: ParsedPensionTransactionPayloadBase): ValidationResult {
  if (base.amount <= 0)
    return { ok: false, error: 'Contribution amount must be greater than zero' };
  if (base.taxAmount < 0) return { ok: false, error: 'Tax amount cannot be negative' };
  if (base.taxAmount > base.amount)
    return { ok: false, error: 'Tax amount cannot exceed contribution amount' };
  if (typeof base.isEmployer !== 'boolean')
    return { ok: false, error: 'Contribution requires employer/employee source' };

  return {
    ok: true,
    data: {
      potId: base.potId,
      type: base.type,
      amount: base.amount,
      taxAmount: base.taxAmount,
      date: base.date,
      note: base.note,
      isEmployer: base.isEmployer,
    },
  };
}

function validateFeePayload(base: ParsedPensionTransactionPayloadBase): ValidationResult {
  if (base.amount <= 0) return { ok: false, error: 'Fee amount must be greater than zero' };
  return {
    ok: true,
    data: {
      potId: base.potId,
      type: base.type,
      amount: base.amount,
      taxAmount: 0,
      date: base.date,
      note: base.note,
      isEmployer: null,
    },
  };
}

function validateAnnualStatementPayload(
  base: ParsedPensionTransactionPayloadBase,
): ValidationResult {
  if (base.amount === 0) return { ok: false, error: 'Annual statement amount cannot be zero' };
  return {
    ok: true,
    data: {
      potId: base.potId,
      type: base.type,
      amount: base.amount,
      taxAmount: 0,
      date: base.date,
      note: base.note,
      isEmployer: null,
    },
  };
}

function computePensionTransactionDelta(txn: {
  type: string;
  amount: number;
  taxAmount: number;
}): number {
  if (txn.type === 'contribution') return txn.amount - txn.taxAmount;
  if (txn.type === 'fee') return -txn.amount;
  if (txn.type === 'annual_statement') return txn.amount;
  return 0;
}

function normalizeTransactionRow(row: {
  potId: number;
  type: string;
  amount: unknown;
  taxAmount?: unknown;
  date: string;
  note: string | null;
  isEmployer: boolean | null;
}): {
  potId: number;
  type: string;
  amount: number;
  taxAmount: number;
  date: string;
  note: string;
  isEmployer: boolean | null;
} {
  return {
    potId: row.potId,
    type: row.type,
    amount: toFiniteNumber(row.amount) ?? 0,
    taxAmount: toFiniteNumber(row.taxAmount ?? 0) ?? 0,
    date: row.date,
    note: row.note ?? '',
    isEmployer: row.isEmployer ?? null,
  };
}

function validatePensionTransactionPayload(
  rawPayload: RawPensionTransactionPayload,
): ValidationResult {
  const parsed = parsePensionTransactionPayloadBase(rawPayload);
  if (!parsed.ok) return parsed;

  if (parsed.data.type === 'contribution') return validateContributionPayload(parsed.data);
  if (parsed.data.type === 'fee') return validateFeePayload(parsed.data);
  return validateAnnualStatementPayload(parsed.data);
}

function isRouteMutationError(
  result: RouteMutationResult,
): result is { error: string; status: (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS] } {
  return 'error' in result;
}

function formatStatementDocumentResponse(document: PensionStatementDocumentRecord) {
  return {
    id: document.id,
    transactionId: document.transactionId,
    potId: document.potId,
    fileName: document.fileName,
    mimeType: PDF_MIME_TYPE,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt.toISOString(),
  };
}

function formatStatementDocumentFromTransaction(
  row: typeof pensionTransactions.$inferSelect,
): PensionStatementDocumentRecord | null {
  const document = readInlinePdfDocument(row);
  if (!document) return null;

  return {
    id: row.id,
    transactionId: row.id,
    potId: row.potId,
    storageKey: document.storageKey,
    fileName: document.fileName,
    mimeType: PDF_MIME_TYPE,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt,
  };
}

async function isPensionPotOwnedByUser(
  tx: DbTransaction,
  userId: number,
  potId: number,
): Promise<boolean> {
  const [pot] = await tx
    .select({ id: pensionPots.id })
    .from(pensionPots)
    .where(and(eq(pensionPots.id, potId), eq(pensionPots.userId, userId)));
  return Boolean(pot);
}

async function applyPensionPotBalanceDelta(
  tx: DbTransaction,
  userId: number,
  potId: number,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  await tx
    .update(pensionPots)
    .set({
      balance: sql`CAST(${pensionPots.balance} AS numeric) + ${delta}`,
    })
    .where(and(eq(pensionPots.id, potId), eq(pensionPots.userId, userId)));
}

type UploadStatementDocumentResult =
  | { ok: true; document: PensionStatementDocumentRecord }
  | { ok: false; error: string; status: (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS] };

async function persistStatementDocumentMetadata(params: {
  userId: number;
  transactionId: number;
  storageKey: string;
  uploaded: Awaited<ReturnType<typeof uploadPdfFile>>;
  previousDocument: ReturnType<typeof readInlinePdfDocument>;
}): Promise<UploadStatementDocumentResult> {
  try {
    const [updated] = await db
      .update(pensionTransactions)
      .set({
        documentStorageKey: params.storageKey,
        documentFileName: params.uploaded.fileName,
        documentSizeBytes: params.uploaded.sizeBytes,
        documentUploadedAt: params.uploaded.uploadedAt,
      })
      .where(
        and(
          eq(pensionTransactions.id, params.transactionId),
          eq(pensionTransactions.userId, params.userId),
        ),
      )
      .returning();

    if (!updated) {
      await deleteStoredPdfSafely(params.storageKey, 'pension statement PDF');
      return { ok: false, error: 'Transaction not found', status: HTTP_STATUS.NOT_FOUND };
    }

    if (params.previousDocument && params.previousDocument.storageKey !== params.storageKey) {
      await deleteStoredPdfSafely(params.previousDocument.storageKey, 'pension statement PDF');
    }

    const document = formatStatementDocumentFromTransaction(updated);
    if (!document) {
      await deleteStoredPdfSafely(params.storageKey, 'pension statement PDF');
      return {
        ok: false,
        error: 'Failed to save statement document',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      };
    }

    return { ok: true, document };
  } catch (error) {
    await deleteStoredPdfSafely(params.storageKey, 'pension statement PDF');
    console.error('Failed to persist pension statement document metadata', error);
    return {
      ok: false,
      error: 'Failed to save statement document',
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    };
  }
}

async function uploadStatementDocumentForTransaction(params: {
  userId: number;
  transactionId: number;
  file: File;
}): Promise<UploadStatementDocumentResult> {
  const [transactionRow] = await db
    .select()
    .from(pensionTransactions)
    .where(
      and(
        eq(pensionTransactions.id, params.transactionId),
        eq(pensionTransactions.userId, params.userId),
      ),
    );
  const transaction = transactionRow ?? null;

  if (!transaction)
    return { ok: false, error: 'Transaction not found', status: HTTP_STATUS.NOT_FOUND };
  if (transaction.type !== 'annual_statement') {
    return {
      ok: false,
      error: 'Documents can only be attached to annual statement transactions',
      status: HTTP_STATUS.BAD_REQUEST,
    };
  }

  const previousDocument = readInlinePdfDocument(transaction);
  const storageKey = buildPensionDocumentStorageKey({
    userId: params.userId,
    potId: transaction.potId,
    transactionId: params.transactionId,
  });
  const uploaded = await uploadPdfFile({
    key: storageKey,
    file: params.file,
    fallbackBaseName: 'annual-statement',
  }).catch((error: unknown) => {
    console.error('Failed to upload pension statement document to storage', error);
    return null;
  });
  if (!uploaded) {
    return {
      ok: false,
      error: 'Failed to upload statement document',
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    };
  }

  return persistStatementDocumentMetadata({
    userId: params.userId,
    transactionId: params.transactionId,
    storageKey,
    uploaded,
    previousDocument,
  });
}

async function getStatementDocumentByTransaction(params: {
  userId: number;
  transactionId: number;
}): Promise<PensionStatementDocumentRecord | null> {
  const [transaction] = await db
    .select()
    .from(pensionTransactions)
    .where(
      and(
        eq(pensionTransactions.userId, params.userId),
        eq(pensionTransactions.id, params.transactionId),
      ),
    );

  if (!transaction) return null;
  return formatStatementDocumentFromTransaction(transaction);
}

function mergePensionTransactionPayload(
  raw: Record<string, unknown>,
  existing: ReturnType<typeof normalizeTransactionRow>,
): ValidationResult {
  return validatePensionTransactionPayload({
    potId: raw.potId ?? existing.potId,
    type: raw.type ?? existing.type,
    amount: raw.amount ?? existing.amount,
    taxAmount: raw.taxAmount ?? existing.taxAmount,
    date: raw.date ?? existing.date,
    note: raw.note ?? existing.note,
    isEmployer: raw.isEmployer ?? existing.isEmployer,
  });
}

async function syncPensionBalancesForEditedTransaction(params: {
  tx: DbTransaction;
  userId: number;
  previousPotId: number;
  nextPotId: number;
  previousDelta: number;
  nextDelta: number;
}): Promise<void> {
  if (params.previousPotId === params.nextPotId) {
    await applyPensionPotBalanceDelta(
      params.tx,
      params.userId,
      params.previousPotId,
      params.nextDelta - params.previousDelta,
    );
    return;
  }

  await applyPensionPotBalanceDelta(
    params.tx,
    params.userId,
    params.previousPotId,
    -params.previousDelta,
  );
  await applyPensionPotBalanceDelta(params.tx, params.userId, params.nextPotId, params.nextDelta);
}

async function handleStatementDocumentAfterTransactionUpdate(params: {
  tx: DbTransaction;
  userId: number;
  transactionId: number;
  previousType: string;
  nextType: string;
  existingRow: typeof pensionTransactions.$inferSelect;
}): Promise<string | null> {
  if (params.previousType === 'annual_statement' && params.nextType !== 'annual_statement') {
    const document = readInlinePdfDocument(params.existingRow);
    if (!document) return null;

    await params.tx
      .update(pensionTransactions)
      .set(CLEAR_INLINE_PDF_DOCUMENT)
      .where(
        and(
          eq(pensionTransactions.id, params.transactionId),
          eq(pensionTransactions.userId, params.userId),
        ),
      );

    return document.storageKey;
  }

  return null;
}

function createPensionTransaction(params: {
  userId: number;
  payload: NormalizedPensionTransactionPayload;
}): Promise<RouteMutationResult> {
  return db.transaction(async (tx) => {
    if (!(await isPensionPotOwnedByUser(tx, params.userId, params.payload.potId))) {
      return { error: 'Pension pot not found', status: HTTP_STATUS.NOT_FOUND };
    }

    const [data] = await tx
      .insert(pensionTransactions)
      .values(toPensionTransactionInsertPayload(params.payload, params.userId))
      .returning();

    await applyPensionPotBalanceDelta(
      tx,
      params.userId,
      params.payload.potId,
      computePensionTransactionDelta(params.payload),
    );

    return { data };
  });
}

async function updatePensionTransaction(params: {
  userId: number;
  transactionId: number;
  raw: Record<string, unknown>;
}): Promise<RouteMutationResult> {
  let storageKeyToDelete: string | null = null;
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(pensionTransactions)
      .where(
        and(
          eq(pensionTransactions.id, params.transactionId),
          eq(pensionTransactions.userId, params.userId),
        ),
      );
    if (!existing) return { error: 'Transaction not found', status: HTTP_STATUS.NOT_FOUND };

    const normalizedExisting = normalizeTransactionRow(existing);
    const mergedPayload = mergePensionTransactionPayload(params.raw, normalizedExisting);
    if (!mergedPayload.ok) return { error: mergedPayload.error, status: HTTP_STATUS.BAD_REQUEST };

    const nextPayload = mergedPayload.data;
    const movingToAnotherPot = nextPayload.potId !== normalizedExisting.potId;
    if (
      movingToAnotherPot &&
      !(await isPensionPotOwnedByUser(tx, params.userId, nextPayload.potId))
    ) {
      return { error: 'Pension pot not found', status: HTTP_STATUS.NOT_FOUND };
    }

    const [data] = await tx
      .update(pensionTransactions)
      .set(toPensionTransactionUpdatePayload(nextPayload))
      .where(
        and(
          eq(pensionTransactions.id, params.transactionId),
          eq(pensionTransactions.userId, params.userId),
        ),
      )
      .returning();

    await syncPensionBalancesForEditedTransaction({
      tx,
      userId: params.userId,
      previousPotId: normalizedExisting.potId,
      nextPotId: nextPayload.potId,
      previousDelta: computePensionTransactionDelta(normalizedExisting),
      nextDelta: computePensionTransactionDelta(nextPayload),
    });

    storageKeyToDelete = await handleStatementDocumentAfterTransactionUpdate({
      tx,
      userId: params.userId,
      transactionId: params.transactionId,
      previousType: normalizedExisting.type,
      nextType: nextPayload.type,
      existingRow: existing,
    });

    return { data };
  });

  if (!isRouteMutationError(result) && storageKeyToDelete) {
    await deleteStoredPdfSafely(storageKeyToDelete, 'pension statement PDF');
  }

  return result;
}

async function deletePensionTransaction(params: {
  userId: number;
  transactionId: number;
}): Promise<RouteMutationResult> {
  let storageKeyToDelete: string | null = null;
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(pensionTransactions)
      .where(
        and(
          eq(pensionTransactions.id, params.transactionId),
          eq(pensionTransactions.userId, params.userId),
        ),
      );
    if (!existing) return { error: 'Transaction not found', status: HTTP_STATUS.NOT_FOUND };

    const normalizedExisting = normalizeTransactionRow(existing);
    storageKeyToDelete = readInlinePdfDocument(existing)?.storageKey ?? null;
    const [data] = await tx
      .delete(pensionTransactions)
      .where(
        and(
          eq(pensionTransactions.id, params.transactionId),
          eq(pensionTransactions.userId, params.userId),
        ),
      )
      .returning();

    await applyPensionPotBalanceDelta(
      tx,
      params.userId,
      normalizedExisting.potId,
      -computePensionTransactionDelta(normalizedExisting),
    );

    return { data };
  });

  if (!isRouteMutationError(result) && storageKeyToDelete) {
    await deleteStoredPdfSafely(storageKeyToDelete, 'pension statement PDF');
  }

  return result;
}

// ── Pots ─────────────────────────────────────────────────────────────────────

app.get('/pots', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(pensionPots).where(eq(pensionPots.userId, user.id));
  return c.json({ data });
});

app.get('/pots/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(pensionPots)
    .where(and(eq(pensionPots.id, id), eq(pensionPots.userId, user.id)));
  if (!data) return c.json({ error: 'Pension pot not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/pots', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid pension pot payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePensionPotCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .insert(pensionPots)
    .values(toPensionPotInsertPayload(body.value, user.id))
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/pots/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid pension pot payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePensionPotPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No pension pot fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const [data] = await db
    .update(pensionPots)
    .set(toPensionPotUpdatePayload(body.value))
    .where(and(eq(pensionPots.id, id), eq(pensionPots.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Pension pot not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/pots/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(pensionPots)
    .where(and(eq(pensionPots.id, id), eq(pensionPots.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Pension pot not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Transactions ─────────────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const potId = c.req.query('potId');
  if (potId !== undefined) {
    const parsedPotId = parseId(potId);
    if (parsedPotId === null)
      return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
    const data = await db
      .select()
      .from(pensionTransactions)
      .where(
        and(eq(pensionTransactions.potId, parsedPotId), eq(pensionTransactions.userId, user.id)),
      );
    return c.json({ data });
  }
  const data = await db
    .select()
    .from(pensionTransactions)
    .where(eq(pensionTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(pensionTransactions)
    .where(and(eq(pensionTransactions.id, id), eq(pensionTransactions.userId, user.id)));
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid pension transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const validated = parsePensionTransactionCreate(rawBody.value);
  if (!validated.ok) return c.json({ error: validated.error }, HTTP_STATUS.BAD_REQUEST);

  const result = await createPensionTransaction({ userId: user.id, payload: validated.value });
  if (isRouteMutationError(result)) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid pension transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePensionTransactionPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No pension transaction fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const result = await updatePensionTransaction({
    userId: user.id,
    transactionId: id,
    raw: body.value,
  });
  if (isRouteMutationError(result)) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const result = await deletePensionTransaction({ userId: user.id, transactionId: id });
  if (isRouteMutationError(result)) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

// ── Statement Documents ──────────────────────────────────────────────────────

app.get('/documents', async (c) => {
  const user = getAuthUser(c);
  const potIdRaw = c.req.query('potId');

  const whereClause =
    potIdRaw === undefined
      ? and(
          eq(pensionTransactions.userId, user.id),
          isNotNull(pensionTransactions.documentStorageKey),
        )
      : (() => {
          const parsedPotId = parseId(potIdRaw);
          if (parsedPotId === null) return null;
          return and(
            eq(pensionTransactions.userId, user.id),
            eq(pensionTransactions.potId, parsedPotId),
            isNotNull(pensionTransactions.documentStorageKey),
          );
        })();

  if (whereClause === null) {
    return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
  }

  const data = await db.select().from(pensionTransactions).where(whereClause);
  return c.json({
    data: data
      .map((row) => formatStatementDocumentFromTransaction(row))
      .filter((row): row is PensionStatementDocumentRecord => row !== null)
      .map(formatStatementDocumentResponse),
  });
});

app.post('/transactions/:id/document', async (c) => {
  const user = getAuthUser(c);
  const transactionId = parseId(c.req.param('id'));
  if (transactionId === null)
    return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const formData = await c.req.formData();
  const file = asFile(formData.get('file'));
  if (!file) return c.json({ error: 'A PDF file is required' }, HTTP_STATUS.BAD_REQUEST);

  const validation = validateUploadedPdf(file);
  if (!validation.valid) return c.json({ error: validation.error }, HTTP_STATUS.BAD_REQUEST);

  const result = await uploadStatementDocumentForTransaction({
    userId: user.id,
    transactionId,
    file,
  });

  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ data: formatStatementDocumentResponse(result.document) }, HTTP_STATUS.CREATED);
});

app.get('/transactions/:id/document/download', async (c) => {
  const user = getAuthUser(c);
  const transactionId = parseId(c.req.param('id'));
  if (transactionId === null)
    return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const document = await getStatementDocumentByTransaction({
    userId: user.id,
    transactionId,
  });
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
    console.error('Failed to download pension statement document', error);
    return c.json({ error: 'Failed to download document' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
});

app.delete('/transactions/:id/document', async (c) => {
  const user = getAuthUser(c);
  const transactionId = parseId(c.req.param('id'));
  if (transactionId === null)
    return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const existingDocument = await getStatementDocumentByTransaction({
    userId: user.id,
    transactionId,
  });
  if (!existingDocument) return c.json({ error: 'Document not found' }, HTTP_STATUS.NOT_FOUND);

  await db
    .update(pensionTransactions)
    .set(CLEAR_INLINE_PDF_DOCUMENT)
    .where(and(eq(pensionTransactions.userId, user.id), eq(pensionTransactions.id, transactionId)));

  await deleteStoredPdfSafely(existingDocument.storageKey, 'pension statement PDF');
  return c.json({ data: formatStatementDocumentResponse(existingDocument) });
});

export default app;
