import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { HTTP_STATUS } from '../constants/http';
import {
  pensionPots,
  pensionStatementDocuments,
  pensionStatementImportRows,
  pensionStatementImports,
  pensionTransactions,
} from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import {
  parsePensionStatement,
  type PensionParserResult,
  type PensionParserRow,
} from '../lib/pensionParserClient';
import { deleteS3Object, getS3ObjectBytes, uploadS3Object } from '../lib/s3';

const app = new Hono();

const MAX_INT32 = 2_147_483_647;
const PDF_MIME_TYPE = 'application/pdf';
const PDF_EXTENSION = '.pdf';
const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TRANSACTION_TYPES = ['contribution', 'fee', 'annual_statement'] as const;
const ACTIVE_IMPORT_STATUSES = ['queued', 'processing', 'ready_for_review', 'committed'] as const;
const LIST_IMPORT_DEFAULT_STATUSES = [
  'queued',
  'processing',
  'ready_for_review',
  'failed',
] as const;
const DEFAULT_LANGUAGE_HINTS = ['en', 'nl'];
const IMPORT_TTL_DAYS_DEFAULT = 7;
const IMPORT_LIST_DEFAULT_LIMIT = 30;
const IMPORT_LIST_MAX_LIMIT = 100;

type PensionTransactionType = (typeof TRANSACTION_TYPES)[number];

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

type NormalizedPensionTransactionPayload = {
  potId: number;
  type: PensionTransactionType;
  amount: number;
  taxAmount: number;
  date: string;
  note: string;
  isEmployer: boolean | null;
};

type ValidationResult =
  | { ok: true; data: NormalizedPensionTransactionPayload }
  | { ok: false; error: string };

type ImportStatus =
  | 'queued'
  | 'processing'
  | 'ready_for_review'
  | 'failed'
  | 'committed'
  | 'expired'
  | 'cancelled';

const IMPORT_STATUSES: ImportStatus[] = [
  'queued',
  'processing',
  'ready_for_review',
  'failed',
  'committed',
  'expired',
  'cancelled',
];
const IMPORT_STATUS_SET = new Set<ImportStatus>(IMPORT_STATUSES);

type ImportRecord = typeof pensionStatementImports.$inferSelect;
type ImportRowRecord = typeof pensionStatementImportRows.$inferSelect;
type PensionTransactionRecord = typeof pensionTransactions.$inferSelect;
type ImportFeedRow = {
  id: number;
  userId: number;
  potId: number;
  status: ImportStatus;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: unknown;
  fileHashSha256: string;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  languageHints: unknown;
  modelName: string | null;
  modelVersion: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  committedAt: Date | null;
  potName: string;
  potProvider: string;
  potEmoji: string | null;
};

function parseId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_INT32) return null;
  return parsed;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: unknown): number {
  const parsed = toFiniteNumber(value);
  return parsed ?? 0;
}

function normalizeFileName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return `annual-statement${PDF_EXTENSION}`;
  return trimmed.replaceAll(/[^\w.-]+/g, '_');
}

function hasPdfExtension(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith(PDF_EXTENSION);
}

function isAllowedPdfMimeType(mimeType: string): boolean {
  return mimeType === PDF_MIME_TYPE || mimeType === '';
}

function isValidUploadedPdf(file: File): { valid: true } | { valid: false; error: string } {
  if (file.size <= 0) return { valid: false, error: 'Uploaded file is empty' };
  if (file.size > MAX_PDF_SIZE_BYTES) return { valid: false, error: 'PDF exceeds 20MB limit' };
  if (!hasPdfExtension(file.name)) return { valid: false, error: 'Only PDF files are allowed' };
  if (!isAllowedPdfMimeType(file.type))
    return { valid: false, error: 'Only PDF files are allowed' };
  return { valid: true };
}

function asFile(value: unknown): File | null {
  return value instanceof File ? value : null;
}

function parsePensionTransactionType(value: unknown): PensionTransactionType | null {
  if (typeof value !== 'string') return null;
  return TRANSACTION_TYPES.includes(value as PensionTransactionType)
    ? (value as PensionTransactionType)
    : null;
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

  const date = typeof rawPayload.date === 'string' ? rawPayload.date : '';
  if (!ISO_DATE_PATTERN.test(date)) return { ok: false, error: 'Invalid transaction date' };

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

function validatePensionTransactionPayload(
  rawPayload: RawPensionTransactionPayload,
): ValidationResult {
  const parsed = parsePensionTransactionPayloadBase(rawPayload);
  if (!parsed.ok) return parsed;
  if (parsed.data.type === 'contribution') return validateContributionPayload(parsed.data);
  if (parsed.data.type === 'fee') return validateFeePayload(parsed.data);
  return validateAnnualStatementPayload(parsed.data);
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

function buildImportStorageKey(params: { userId: number; potId: number }): string {
  return [
    'users',
    String(params.userId),
    'pensions',
    String(params.potId),
    'imports',
    `${crypto.randomUUID()}${PDF_EXTENSION}`,
  ].join('/');
}

function parseImportTtlDays(): number {
  const parsed = Number.parseInt(process.env.IMPORT_DRAFT_TTL_DAYS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return IMPORT_TTL_DAYS_DEFAULT;
  return parsed;
}

function parseImportListLimit(value: string | undefined): number {
  if (!value) return IMPORT_LIST_DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return IMPORT_LIST_DEFAULT_LIMIT;
  return Math.min(parsed, IMPORT_LIST_MAX_LIMIT);
}

function parseImportStatuses(
  value: string | undefined,
): { ok: true; data: ImportStatus[] } | { ok: false; error: string } {
  if (!value) {
    return {
      ok: true,
      data: [...LIST_IMPORT_DEFAULT_STATUSES],
    };
  }

  const rawStatuses = value
    .split(',')
    .map((status) => status.trim())
    .filter(Boolean);
  if (rawStatuses.length === 0) {
    return { ok: false, error: 'At least one import status is required' };
  }

  const invalidStatuses = rawStatuses.filter(
    (status): boolean => !IMPORT_STATUS_SET.has(status as ImportStatus),
  );
  if (invalidStatuses.length > 0) {
    return {
      ok: false,
      error: `Invalid import status filter: ${invalidStatuses.join(', ')}`,
    };
  }

  return {
    ok: true,
    data: [...new Set(rawStatuses as ImportStatus[])],
  };
}

function getImportExpiryDate(now = new Date()): Date {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + parseImportTtlDays());
  return expiresAt;
}

function normalizeImportResponse(row: {
  id: number;
  userId: number;
  potId: number;
  status: ImportStatus;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: unknown;
  fileHashSha256: string;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  languageHints: unknown;
  modelName: string | null;
  modelVersion: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  committedAt: Date | null;
}) {
  return {
    id: row.id,
    potId: row.potId,
    status: row.status,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: toNumber(row.sizeBytes),
    fileHashSha256: row.fileHashSha256,
    statementPeriodStart: row.statementPeriodStart,
    statementPeriodEnd: row.statementPeriodEnd,
    languageHints: Array.isArray(row.languageHints)
      ? row.languageHints.filter((item): item is string => typeof item === 'string')
      : [],
    modelName: row.modelName,
    modelVersion: row.modelVersion,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    committedAt: row.committedAt?.toISOString() ?? null,
  };
}

function normalizeImportRowResponse(row: {
  id: number;
  importId: number;
  rowOrder: number;
  type: string;
  amount: unknown;
  taxAmount: unknown;
  date: string;
  note: string;
  isEmployer: boolean | null;
  confidence: unknown;
  confidenceLabel: 'high' | 'medium' | 'low';
  evidence: unknown;
  isDerived: boolean;
  isDeleted: boolean;
  collisionWarning: unknown;
  committedTransactionId: number | null;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    importId: row.importId,
    rowOrder: row.rowOrder,
    type: row.type,
    amount: toNumber(row.amount),
    taxAmount: toNumber(row.taxAmount),
    date: row.date,
    note: row.note,
    isEmployer: row.isEmployer,
    confidence: toNumber(row.confidence),
    confidenceLabel: row.confidenceLabel,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    isDerived: row.isDerived,
    isDeleted: row.isDeleted,
    collisionWarning:
      row.collisionWarning && typeof row.collisionWarning === 'object'
        ? row.collisionWarning
        : null,
    committedTransactionId: row.committedTransactionId,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function deleteS3ObjectSafely(storageKey: string): Promise<void> {
  try {
    await deleteS3Object({ key: storageKey });
  } catch (error) {
    console.error('Failed to delete pension statement import document from storage', {
      storageKey,
      error,
    });
  }
}

async function getOwnedImport(userId: number, importId: number) {
  const [importRecord] = await db
    .select()
    .from(pensionStatementImports)
    .where(
      and(eq(pensionStatementImports.userId, userId), eq(pensionStatementImports.id, importId)),
    );
  return importRecord ?? null;
}

async function assertOwnedPot(userId: number, potId: number): Promise<boolean> {
  const [pot] = await db
    .select({ id: pensionPots.id })
    .from(pensionPots)
    .where(and(eq(pensionPots.userId, userId), eq(pensionPots.id, potId)));
  return Boolean(pot);
}

async function hasDuplicateImport(params: {
  userId: number;
  potId: number;
  fileHashSha256: string;
  statementPeriodStart?: string | null;
  statementPeriodEnd?: string | null;
  excludingImportId?: number;
}): Promise<boolean> {
  const conditions = [
    eq(pensionStatementImports.userId, params.userId),
    eq(pensionStatementImports.potId, params.potId),
    eq(pensionStatementImports.fileHashSha256, params.fileHashSha256),
    inArray(pensionStatementImports.status, ACTIVE_IMPORT_STATUSES as unknown as ImportStatus[]),
  ];

  if (params.statementPeriodStart && params.statementPeriodEnd) {
    conditions.push(eq(pensionStatementImports.statementPeriodStart, params.statementPeriodStart));
    conditions.push(eq(pensionStatementImports.statementPeriodEnd, params.statementPeriodEnd));
  }

  if (params.excludingImportId) {
    conditions.push(ne(pensionStatementImports.id, params.excludingImportId));
  }

  const [existing] = await db
    .select({ id: pensionStatementImports.id })
    .from(pensionStatementImports)
    .where(and(...conditions))
    .limit(1);

  return Boolean(existing);
}

function listImportFeedItems(params: {
  userId: number;
  statuses: ImportStatus[];
  limit: number;
}): Promise<ImportFeedRow[]> {
  return db
    .select({
      id: pensionStatementImports.id,
      userId: pensionStatementImports.userId,
      potId: pensionStatementImports.potId,
      status: pensionStatementImports.status,
      storageKey: pensionStatementImports.storageKey,
      fileName: pensionStatementImports.fileName,
      mimeType: pensionStatementImports.mimeType,
      sizeBytes: pensionStatementImports.sizeBytes,
      fileHashSha256: pensionStatementImports.fileHashSha256,
      statementPeriodStart: pensionStatementImports.statementPeriodStart,
      statementPeriodEnd: pensionStatementImports.statementPeriodEnd,
      languageHints: pensionStatementImports.languageHints,
      modelName: pensionStatementImports.modelName,
      modelVersion: pensionStatementImports.modelVersion,
      errorMessage: pensionStatementImports.errorMessage,
      createdAt: pensionStatementImports.createdAt,
      updatedAt: pensionStatementImports.updatedAt,
      expiresAt: pensionStatementImports.expiresAt,
      committedAt: pensionStatementImports.committedAt,
      potName: pensionPots.name,
      potProvider: pensionPots.provider,
      potEmoji: pensionPots.emoji,
    })
    .from(pensionStatementImports)
    .innerJoin(
      pensionPots,
      and(
        eq(pensionPots.id, pensionStatementImports.potId),
        eq(pensionPots.userId, pensionStatementImports.userId),
      ),
    )
    .where(
      and(
        eq(pensionStatementImports.userId, params.userId),
        inArray(pensionStatementImports.status, params.statuses),
      ),
    )
    .orderBy(desc(pensionStatementImports.updatedAt), desc(pensionStatementImports.id))
    .limit(params.limit) as Promise<ImportFeedRow[]>;
}

function toImportFeedPayload(importRow: ImportFeedRow): Record<string, unknown> {
  return {
    import: normalizeImportResponse(importRow),
    pot: {
      id: importRow.potId,
      name: importRow.potName,
      provider: importRow.potProvider,
      emoji: importRow.potEmoji,
    },
  };
}

async function getEditableImport(userId: number, importId: number): Promise<ImportRecord | null> {
  const importRecord = await getOwnedImport(userId, importId);
  if (!importRecord) return null;
  if (importRecord.status !== 'ready_for_review') return null;
  return importRecord;
}

async function getImportRow(importId: number, rowId: number): Promise<ImportRowRecord | null> {
  const [row] = await db
    .select()
    .from(pensionStatementImportRows)
    .where(
      and(
        eq(pensionStatementImportRows.id, rowId),
        eq(pensionStatementImportRows.importId, importId),
      ),
    );
  return row ?? null;
}

function validateEditableRowUpdate(params: {
  importRecord: ImportRecord;
  existingRow: ImportRowRecord;
  body: Record<string, unknown>;
}): ValidationResult {
  return validatePensionTransactionPayload({
    potId: params.importRecord.potId,
    type: params.body.type ?? params.existingRow.type,
    amount: params.body.amount ?? toNumber(params.existingRow.amount),
    taxAmount: params.body.taxAmount ?? toNumber(params.existingRow.taxAmount),
    date: params.body.date ?? params.existingRow.date,
    note: params.body.note ?? params.existingRow.note,
    isEmployer: params.body.isEmployer ?? params.existingRow.isEmployer,
  });
}

function loadCommitRows(importId: number): Promise<ImportRowRecord[]> {
  return db
    .select()
    .from(pensionStatementImportRows)
    .where(
      and(
        eq(pensionStatementImportRows.importId, importId),
        eq(pensionStatementImportRows.isDeleted, false),
      ),
    )
    .orderBy(asc(pensionStatementImportRows.rowOrder));
}

function validateRowsForCommit(rows: ImportRowRecord[], potId: number): string | null {
  if (rows.length === 0) return 'No rows selected for commit';

  const annualRows = rows.filter((row) => row.type === 'annual_statement');
  if (annualRows.length !== 1) {
    return 'Exactly one annual statement row is required before commit';
  }

  for (const row of rows) {
    const validated = validatePensionTransactionPayload({
      potId,
      type: row.type,
      amount: toNumber(row.amount),
      taxAmount: toNumber(row.taxAmount),
      date: row.date,
      note: row.note,
      isEmployer: row.isEmployer,
    });
    if (!validated.ok) return `Row ${row.rowOrder + 1}: ${validated.error}`;
  }

  return null;
}

async function commitRowsToLedger(params: {
  userId: number;
  importRecord: ImportRecord;
  importId: number;
  rows: ImportRowRecord[];
  now: Date;
}): Promise<number[]> {
  const committedTransactionIds: number[] = [];

  await db.transaction(async (tx) => {
    let annualStatementTransactionId: number | null = null;

    for (const row of params.rows) {
      const validated = validatePensionTransactionPayload({
        potId: params.importRecord.potId,
        type: row.type,
        amount: toNumber(row.amount),
        taxAmount: toNumber(row.taxAmount),
        date: row.date,
        note: row.note,
        isEmployer: row.isEmployer,
      });
      if (!validated.ok) throw new Error(`Invalid row ${row.id}: ${validated.error}`);

      const [transaction] = await tx
        .insert(pensionTransactions)
        .values({
          userId: params.userId,
          potId: params.importRecord.potId,
          type: validated.data.type,
          amount: String(validated.data.amount),
          taxAmount: String(validated.data.taxAmount),
          date: validated.data.date,
          note: validated.data.note,
          isEmployer: validated.data.isEmployer,
        })
        .returning();

      committedTransactionIds.push(transaction.id);
      if (validated.data.type === 'annual_statement') annualStatementTransactionId = transaction.id;

      await tx
        .update(pensionPots)
        .set({
          balance: sql`CAST(${pensionPots.balance} AS numeric) + ${computePensionTransactionDelta(validated.data)}`,
        })
        .where(
          and(eq(pensionPots.id, params.importRecord.potId), eq(pensionPots.userId, params.userId)),
        );

      await tx
        .update(pensionStatementImportRows)
        .set({
          committedTransactionId: transaction.id,
          updatedAt: params.now,
        })
        .where(eq(pensionStatementImportRows.id, row.id));
    }

    if (annualStatementTransactionId === null) {
      throw new Error('Missing annual statement transaction');
    }

    await tx.insert(pensionStatementDocuments).values({
      userId: params.userId,
      potId: params.importRecord.potId,
      transactionId: annualStatementTransactionId,
      storageKey: params.importRecord.storageKey,
      fileName: params.importRecord.fileName,
      mimeType: PDF_MIME_TYPE,
      sizeBytes: params.importRecord.sizeBytes,
    });

    await tx
      .update(pensionStatementImports)
      .set({
        status: 'committed',
        committedAt: params.now,
        updatedAt: params.now,
        errorMessage: null,
      })
      .where(eq(pensionStatementImports.id, params.importId));
  });

  return committedTransactionIds;
}

function toLanguageHints(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_LANGUAGE_HINTS;
  return value.filter((item): item is string => typeof item === 'string');
}

async function lockNextQueuedImport(): Promise<ImportRecord | null> {
  const [nextImport] = await db
    .select()
    .from(pensionStatementImports)
    .where(eq(pensionStatementImports.status, 'queued'))
    .orderBy(asc(pensionStatementImports.createdAt))
    .limit(1);
  if (!nextImport) return null;

  const [locked] = await db
    .update(pensionStatementImports)
    .set({ status: 'processing', updatedAt: new Date(), errorMessage: null })
    .where(
      and(
        eq(pensionStatementImports.id, nextImport.id),
        eq(pensionStatementImports.status, 'queued'),
      ),
    )
    .returning();
  return locked ?? null;
}

async function getImportPot(
  importRecord: ImportRecord,
): Promise<{ provider: string; currency: string }> {
  const [pot] = await db
    .select({
      id: pensionPots.id,
      provider: pensionPots.provider,
      currency: pensionPots.currency,
    })
    .from(pensionPots)
    .where(
      and(eq(pensionPots.id, importRecord.potId), eq(pensionPots.userId, importRecord.userId)),
    );
  if (!pot) throw new Error('Pension pot not found');
  return pot;
}

async function parseLockedImport(importRecord: ImportRecord): Promise<PensionParserResult> {
  const bytes = await getS3ObjectBytes({ key: importRecord.storageKey });
  if (!bytes || bytes.length === 0) throw new Error('Import document was not found');

  const pot = await getImportPot(importRecord);
  const parsed = await parsePensionStatement({
    fileName: importRecord.fileName,
    fileBytes: bytes,
    provider: pot.provider,
    currency: pot.currency,
    languageHints: toLanguageHints(importRecord.languageHints),
  });

  if (parsed.rows.length === 0) throw new Error('No pension transactions could be extracted');
  return parsed;
}

async function ensureNoParsedDuplicate(
  importRecord: ImportRecord,
  parsed: PensionParserResult,
): Promise<void> {
  const duplicate = await hasDuplicateImport({
    userId: importRecord.userId,
    potId: importRecord.potId,
    fileHashSha256: importRecord.fileHashSha256,
    statementPeriodStart: parsed.statementPeriodStart,
    statementPeriodEnd: parsed.statementPeriodEnd,
    excludingImportId: importRecord.id,
  });

  if (duplicate) {
    throw new Error('An exact duplicate statement has already been imported for this pension pot');
  }
}

function loadExistingTransactionsForImport(
  importRecord: ImportRecord,
): Promise<PensionTransactionRecord[]> {
  return db
    .select()
    .from(pensionTransactions)
    .where(
      and(
        eq(pensionTransactions.userId, importRecord.userId),
        eq(pensionTransactions.potId, importRecord.potId),
      ),
    );
}

function findPotentialCollision(
  parsedRow: PensionParserRow,
  existingTransactions: PensionTransactionRecord[],
): PensionTransactionRecord | null {
  return (
    existingTransactions.find(
      (transaction) =>
        transaction.type === parsedRow.type &&
        transaction.date === parsedRow.date &&
        Math.abs(toNumber(transaction.amount) - parsedRow.amount) <= 0.01,
    ) ?? null
  );
}

function buildParsedImportRowValues(params: {
  importId: number;
  rows: PensionParserRow[];
  existingTransactions: PensionTransactionRecord[];
  now: Date;
}) {
  return params.rows.map((row, index) => {
    const collision = findPotentialCollision(row, params.existingTransactions);
    return {
      importId: params.importId,
      rowOrder: index,
      type: row.type,
      amount: String(row.amount),
      taxAmount: String(row.taxAmount),
      date: row.date,
      note: row.note,
      isEmployer: row.isEmployer,
      confidence: String(row.confidence),
      confidenceLabel: row.confidenceLabel,
      evidence: row.evidence,
      isDerived: row.isDerived,
      collisionWarning: collision
        ? { existingTransactionId: collision.id, reason: 'Potential duplicate transaction' }
        : null,
      createdAt: params.now,
      updatedAt: params.now,
    };
  });
}

async function persistParsedImport(
  importRecord: ImportRecord,
  parsed: PensionParserResult,
): Promise<void> {
  const existingTransactions = await loadExistingTransactionsForImport(importRecord);
  await db.transaction(async (tx) => {
    await tx
      .delete(pensionStatementImportRows)
      .where(eq(pensionStatementImportRows.importId, importRecord.id));

    const now = new Date();
    const values = buildParsedImportRowValues({
      importId: importRecord.id,
      rows: parsed.rows,
      existingTransactions,
      now,
    });

    await tx.insert(pensionStatementImportRows).values(values);
    await tx
      .update(pensionStatementImports)
      .set({
        status: 'ready_for_review',
        statementPeriodStart: parsed.statementPeriodStart,
        statementPeriodEnd: parsed.statementPeriodEnd,
        modelName: parsed.modelName,
        modelVersion: parsed.modelVersion,
        updatedAt: now,
        errorMessage: null,
      })
      .where(eq(pensionStatementImports.id, importRecord.id));
  });
}

async function markImportAsFailed(importId: number, error: unknown): Promise<void> {
  await db
    .update(pensionStatementImports)
    .set({
      status: 'failed',
      updatedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : 'Failed to process import',
    })
    .where(eq(pensionStatementImports.id, importId));
}

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const parsedStatuses = parseImportStatuses(c.req.query('statuses'));
  if (!parsedStatuses.ok) {
    return c.json({ error: parsedStatuses.error }, HTTP_STATUS.BAD_REQUEST);
  }
  const imports = await listImportFeedItems({
    userId: user.id,
    statuses: parsedStatuses.data,
    limit: parseImportListLimit(c.req.query('limit')),
  });

  return c.json({
    data: imports.map(toImportFeedPayload),
  });
});

app.post('/', async (c) => {
  const user = getAuthUser(c);
  const formData = await c.req.formData();
  const potId = parseId(String(formData.get('potId') ?? ''));
  if (potId === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);

  const file = asFile(formData.get('file'));
  if (!file) return c.json({ error: 'A PDF file is required' }, HTTP_STATUS.BAD_REQUEST);

  const validation = isValidUploadedPdf(file);
  if (!validation.valid) return c.json({ error: validation.error }, HTTP_STATUS.BAD_REQUEST);
  if (!(await assertOwnedPot(user.id, potId)))
    return c.json({ error: 'Pension pot not found' }, HTTP_STATUS.NOT_FOUND);

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileHashSha256 = createHash('sha256').update(bytes).digest('hex');
  const duplicate = await hasDuplicateImport({ userId: user.id, potId, fileHashSha256 });
  if (duplicate) {
    return c.json(
      { error: 'An import for this statement already exists for this pension pot' },
      HTTP_STATUS.CONFLICT,
    );
  }

  const storageKey = buildImportStorageKey({ userId: user.id, potId });
  const safeFileName = normalizeFileName(file.name);
  const now = new Date();
  const expiresAt = getImportExpiryDate(now);

  try {
    await uploadS3Object({
      key: storageKey,
      body: bytes,
      contentType: PDF_MIME_TYPE,
    });
  } catch (error) {
    console.error('Failed to upload pension statement import document', error);
    return c.json({ error: 'Failed to upload PDF' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  try {
    const [inserted] = await db
      .insert(pensionStatementImports)
      .values({
        userId: user.id,
        potId,
        status: 'queued',
        storageKey,
        fileName: safeFileName,
        mimeType: PDF_MIME_TYPE,
        sizeBytes: bytes.byteLength,
        fileHashSha256,
        languageHints: DEFAULT_LANGUAGE_HINTS,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      })
      .returning();
    return c.json({ data: normalizeImportResponse(inserted) }, HTTP_STATUS.CREATED);
  } catch (error) {
    await deleteS3ObjectSafely(storageKey);
    console.error('Failed to persist pension statement import metadata', error);
    return c.json({ error: 'Failed to create import' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const importId = parseId(c.req.param('id'));
  if (importId === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);

  const importRecord = await getOwnedImport(user.id, importId);
  if (!importRecord) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);

  const [rowStats] = await db
    .select({
      totalRows: sql<number>`COUNT(*)`,
      deletedRows: sql<number>`COUNT(*) FILTER (WHERE ${pensionStatementImportRows.isDeleted})`,
      activeRows: sql<number>`COUNT(*) FILTER (WHERE NOT ${pensionStatementImportRows.isDeleted})`,
    })
    .from(pensionStatementImportRows)
    .where(eq(pensionStatementImportRows.importId, importId));

  return c.json({
    data: {
      ...normalizeImportResponse(importRecord),
      totalRows: Number(rowStats?.totalRows ?? 0),
      deletedRows: Number(rowStats?.deletedRows ?? 0),
      activeRows: Number(rowStats?.activeRows ?? 0),
    },
  });
});

app.get('/:id/rows', async (c) => {
  const user = getAuthUser(c);
  const importId = parseId(c.req.param('id'));
  if (importId === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);

  const importRecord = await getOwnedImport(user.id, importId);
  if (!importRecord) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);

  const rows = await db
    .select()
    .from(pensionStatementImportRows)
    .where(eq(pensionStatementImportRows.importId, importId))
    .orderBy(asc(pensionStatementImportRows.rowOrder));

  return c.json({ data: rows.map((row) => normalizeImportRowResponse(row)) });
});

app.patch('/:id/rows/:rowId', async (c) => {
  const user = getAuthUser(c);
  const importId = parseId(c.req.param('id'));
  const rowId = parseId(c.req.param('rowId'));
  if (importId === null || rowId === null)
    return c.json({ error: 'Invalid import row id' }, HTTP_STATUS.BAD_REQUEST);

  const editableImport = await getEditableImport(user.id, importId);
  if (!editableImport) {
    const importRecord = await getOwnedImport(user.id, importId);
    if (!importRecord) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);
    return c.json({ error: 'Import is not editable' }, HTTP_STATUS.BAD_REQUEST);
  }

  const existing = await getImportRow(importId, rowId);
  if (!existing) return c.json({ error: 'Import row not found' }, HTTP_STATUS.NOT_FOUND);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const validated = validateEditableRowUpdate({
    importRecord: editableImport,
    existingRow: existing,
    body,
  });
  if (!validated.ok) return c.json({ error: validated.error }, HTTP_STATUS.BAD_REQUEST);

  const now = new Date();
  const [updated] = await db
    .update(pensionStatementImportRows)
    .set({
      type: validated.data.type,
      amount: String(validated.data.amount),
      taxAmount: String(validated.data.taxAmount),
      date: validated.data.date,
      note: validated.data.note,
      isEmployer: validated.data.isEmployer,
      editedAt: now,
      updatedAt: now,
    })
    .where(eq(pensionStatementImportRows.id, rowId))
    .returning();

  return c.json({ data: normalizeImportRowResponse(updated) });
});

app.delete('/:id/rows/:rowId', async (c) => {
  const user = getAuthUser(c);
  const importId = parseId(c.req.param('id'));
  const rowId = parseId(c.req.param('rowId'));
  if (importId === null || rowId === null)
    return c.json({ error: 'Invalid import row id' }, HTTP_STATUS.BAD_REQUEST);

  const importRecord = await getOwnedImport(user.id, importId);
  if (!importRecord) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);
  if (importRecord.status !== 'ready_for_review') {
    return c.json({ error: 'Import is not editable' }, HTTP_STATUS.BAD_REQUEST);
  }

  const [updated] = await db
    .update(pensionStatementImportRows)
    .set({ isDeleted: true, editedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pensionStatementImportRows.id, rowId),
        eq(pensionStatementImportRows.importId, importId),
      ),
    )
    .returning();
  if (!updated) return c.json({ error: 'Import row not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data: normalizeImportRowResponse(updated) });
});

app.post('/:id/rows/:rowId/restore', async (c) => {
  const user = getAuthUser(c);
  const importId = parseId(c.req.param('id'));
  const rowId = parseId(c.req.param('rowId'));
  if (importId === null || rowId === null)
    return c.json({ error: 'Invalid import row id' }, HTTP_STATUS.BAD_REQUEST);

  const importRecord = await getOwnedImport(user.id, importId);
  if (!importRecord) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);
  if (importRecord.status !== 'ready_for_review') {
    return c.json({ error: 'Import is not editable' }, HTTP_STATUS.BAD_REQUEST);
  }

  const [updated] = await db
    .update(pensionStatementImportRows)
    .set({ isDeleted: false, editedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pensionStatementImportRows.id, rowId),
        eq(pensionStatementImportRows.importId, importId),
      ),
    )
    .returning();
  if (!updated) return c.json({ error: 'Import row not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data: normalizeImportRowResponse(updated) });
});

app.post('/:id/commit', async (c) => {
  const user = getAuthUser(c);
  const importId = parseId(c.req.param('id'));
  if (importId === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);

  const importRecord = await getOwnedImport(user.id, importId);
  if (!importRecord) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);
  if (importRecord.status !== 'ready_for_review')
    return c.json({ error: 'Import is not ready for commit' }, HTTP_STATUS.BAD_REQUEST);

  const duplicate = await hasDuplicateImport({
    userId: user.id,
    potId: importRecord.potId,
    fileHashSha256: importRecord.fileHashSha256,
    statementPeriodStart: importRecord.statementPeriodStart,
    statementPeriodEnd: importRecord.statementPeriodEnd,
    excludingImportId: importRecord.id,
  });
  if (duplicate) {
    return c.json(
      { error: 'An exact duplicate statement has already been imported for this pension pot' },
      HTTP_STATUS.CONFLICT,
    );
  }

  const rows = await loadCommitRows(importId);
  const rowValidationError = validateRowsForCommit(rows, importRecord.potId);
  if (rowValidationError) return c.json({ error: rowValidationError }, HTTP_STATUS.BAD_REQUEST);

  const now = new Date();
  let committedTransactionIds: number[] = [];

  try {
    committedTransactionIds = await commitRowsToLedger({
      userId: user.id,
      importRecord,
      importId,
      rows,
      now,
    });
  } catch (error) {
    console.error('Failed to commit pension import', error);
    return c.json({ error: 'Failed to commit import' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  const committedImport = await getOwnedImport(user.id, importId);
  if (!committedImport) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);

  return c.json({
    data: {
      import: normalizeImportResponse(committedImport),
      transactionIds: committedTransactionIds,
    },
  });
});

app.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const importId = parseId(c.req.param('id'));
  if (importId === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);

  const importRecord = await getOwnedImport(user.id, importId);
  if (!importRecord) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);
  if (importRecord.status === 'committed') {
    return c.json({ error: 'Committed imports cannot be cancelled' }, HTTP_STATUS.BAD_REQUEST);
  }

  const [updated] = await db
    .update(pensionStatementImports)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
      errorMessage: null,
    })
    .where(
      and(eq(pensionStatementImports.userId, user.id), eq(pensionStatementImports.id, importId)),
    )
    .returning();

  await deleteS3ObjectSafely(importRecord.storageKey);

  return c.json({ data: normalizeImportResponse(updated) });
});

async function processQueuedImport(): Promise<void> {
  const lockedImport = await lockNextQueuedImport();
  if (!lockedImport) return;

  try {
    const parsed = await parseLockedImport(lockedImport);
    await ensureNoParsedDuplicate(lockedImport, parsed);
    await persistParsedImport(lockedImport, parsed);
  } catch (error) {
    console.error('Failed to process pension statement import', {
      importId: lockedImport.id,
      error,
    });
    await markImportAsFailed(lockedImport.id, error);
  }
}

async function expireDraftImports(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(pensionStatementImports)
    .where(
      and(
        inArray(pensionStatementImports.status, ['queued', 'processing', 'ready_for_review']),
        lte(pensionStatementImports.expiresAt, now),
      ),
    );

  for (const importRecord of expired) {
    await db
      .update(pensionStatementImports)
      .set({
        status: 'expired',
        updatedAt: now,
        errorMessage: 'Draft expired after retention period',
      })
      .where(eq(pensionStatementImports.id, importRecord.id));
    await deleteS3ObjectSafely(importRecord.storageKey);
  }
}

export async function runPensionImportWorkerTick(): Promise<void> {
  await expireDraftImports();
  await processQueuedImport();
}

export default app;
