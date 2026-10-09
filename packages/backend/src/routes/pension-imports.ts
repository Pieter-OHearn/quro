import { findOwnedRow } from '../lib/access';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { getConfig } from '../config';
import { db, type DbTransaction } from '../db/client';
import { HTTP_STATUS } from '../constants/http';
import {
  pensionPots,
  pensionStatementImportRows,
  pensionStatementImports,
  pensionTransactions,
} from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import { withLedgerWrite } from '../lib/ledgerWrite';
import { getPensionStatementImportCapability } from '../lib/capabilities';
import {
  parsePensionStatement,
  type PensionParserResult,
  type PensionParserRow,
} from '../lib/pensionParserClient';
import {
  asFile,
  buildPdfStorageKey,
  deleteStoredPdfSafely,
  normalizePdfFileName,
  PDF_MIME_TYPE,
  validateUploadedPdf,
} from '../lib/pdfDocuments';
import {
  err,
  isRecord,
  ok,
  parseId,
  type ParseResult,
  readJsonBody,
  rejectUnknownFields,
} from '../lib/requestValidation';
import { toNumberOrZero } from '../lib/numbers';
import {
  applyPensionPotBalanceDelta,
  computePensionTransactionDelta,
} from '../lib/pensionTransactions';
import { deleteS3Objects, getS3ObjectBytes, uploadS3Object } from '../lib/s3';
import {
  type NormalizedPensionTransactionPayload,
  validatePensionTransactionPayload,
} from '../lib/pensionTransactionValidation';

const app = new Hono();
const PENSION_IMPORT_PDF_CONTEXT = 'pension statement import document';

const EDITABLE_IMPORT_ROW_FIELDS = [
  'type',
  'amount',
  'taxAmount',
  'date',
  'note',
  'isEmployer',
] as const;
const ACTIVE_IMPORT_STATUSES = ['queued', 'processing', 'ready_for_review', 'committed'] as const;
const LIST_IMPORT_DEFAULT_STATUSES = [
  'queued',
  'processing',
  'ready_for_review',
  'failed',
] as const;
const DEFAULT_LANGUAGE_HINTS = ['en', 'nl'];
const IMPORT_LIST_DEFAULT_LIMIT = 30;
const IMPORT_LIST_MAX_LIMIT = 100;

type ImportStatus =
  'queued' | 'processing' | 'ready_for_review' | 'failed' | 'committed' | 'expired' | 'cancelled';

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

function parseEditableImportRowPatch(body: unknown): ParseResult<Record<string, unknown>> {
  if (!isRecord(body)) return err('Invalid import row payload');
  const strictCheck = rejectUnknownFields(body, EDITABLE_IMPORT_ROW_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_IMPORT_ROW_FIELDS) {
    if (field in body) patch[field] = body[field];
  }

  return ok(patch);
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
  expiresAt.setDate(expiresAt.getDate() + getConfig().pensionImport.draftTtlDays);
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
    sizeBytes: toNumberOrZero(row.sizeBytes),
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
    amount: toNumberOrZero(row.amount),
    taxAmount: toNumberOrZero(row.taxAmount),
    date: row.date,
    note: row.note,
    isEmployer: row.isEmployer,
    confidence: toNumberOrZero(row.confidence),
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

async function assertOwnedPot(userId: number, potId: number): Promise<boolean> {
  return Boolean(await findOwnedRow(pensionPots, potId, userId));
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
  const importRecord = await findOwnedRow(pensionStatementImports, importId, userId);
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
}): ParseResult<NormalizedPensionTransactionPayload> {
  return validatePensionTransactionPayload({
    potId: params.importRecord.potId,
    type: params.body.type ?? params.existingRow.type,
    amount: params.body.amount ?? toNumberOrZero(params.existingRow.amount),
    taxAmount: params.body.taxAmount ?? toNumberOrZero(params.existingRow.taxAmount),
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
      amount: toNumberOrZero(row.amount),
      taxAmount: toNumberOrZero(row.taxAmount),
      date: row.date,
      note: row.note,
      isEmployer: row.isEmployer,
    });
    if (!validated.ok) return `Row ${row.rowOrder + 1}: ${validated.error}`;
  }

  return null;
}

function earliestRowDate(rows: readonly ImportRowRecord[]): string | undefined {
  return [...rows].sort((left, right) => left.date.localeCompare(right.date)).at(0)?.date;
}

const IMPORT_NOT_READY_FOR_COMMIT = 'Import is not ready for commit';

class ImportNotReadyForCommit extends Error {
  constructor() {
    super(IMPORT_NOT_READY_FOR_COMMIT);
  }
}

// Claims the import before any row is written: a second commit of the same import waits here
// and then finds it committed, so the statement reaches the ledger once.
async function claimImportForCommit(tx: DbTransaction, importId: number, now: Date) {
  const [claimed] = await tx
    .update(pensionStatementImports)
    .set({ status: 'committed', committedAt: now, updatedAt: now, errorMessage: null })
    .where(
      and(
        eq(pensionStatementImports.id, importId),
        eq(pensionStatementImports.status, 'ready_for_review'),
      ),
    )
    .returning({ id: pensionStatementImports.id });
  if (!claimed) throw new ImportNotReadyForCommit();
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
    await claimImportForCommit(tx, params.importId, params.now);
    let annualStatementTransactionId: number | null = null;

    for (const row of params.rows) {
      const validated = validatePensionTransactionPayload({
        potId: params.importRecord.potId,
        type: row.type,
        amount: toNumberOrZero(row.amount),
        taxAmount: toNumberOrZero(row.taxAmount),
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
          type: validated.value.type,
          amount: validated.value.amount,
          taxAmount: validated.value.taxAmount,
          date: validated.value.date,
          note: validated.value.note,
          isEmployer: validated.value.isEmployer,
          ...(validated.value.type === 'annual_statement'
            ? {
                documentStorageKey: params.importRecord.storageKey,
                documentFileName: params.importRecord.fileName,
                documentSizeBytes: params.importRecord.sizeBytes,
                documentUploadedAt: params.now,
              }
            : {}),
        })
        .returning();

      committedTransactionIds.push(transaction.id);
      if (validated.value.type === 'annual_statement')
        annualStatementTransactionId = transaction.id;

      await applyPensionPotBalanceDelta(
        tx,
        params.userId,
        params.importRecord.potId,
        computePensionTransactionDelta(validated.value),
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

    const earliestCommittedDate = earliestRowDate(params.rows);
    if (earliestCommittedDate) {
      await withLedgerWrite(tx, { userId: params.userId }, earliestCommittedDate);
    }
  });

  return committedTransactionIds;
}

function toLanguageHints(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_LANGUAGE_HINTS;
  return value.filter((item): item is string => typeof item === 'string');
}

export async function lockNextQueuedImport(): Promise<ImportRecord | null> {
  const [locked] = await db
    .update(pensionStatementImports)
    .set({ status: 'processing', updatedAt: new Date(), errorMessage: null })
    .where(
      eq(
        pensionStatementImports.id,
        sql`(
      SELECT id FROM pension_statement_imports
      WHERE status = 'queued' AND expires_at > now()
      ORDER BY created_at, id
      FOR UPDATE SKIP LOCKED LIMIT 1
    )`,
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
        Math.abs(toNumberOrZero(transaction.amount) - parsedRow.amount) <= 0.01,
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
      amount: row.amount,
      taxAmount: row.taxAmount,
      date: row.date,
      note: row.note,
      isEmployer: row.isEmployer,
      confidence: row.confidence,
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
  const capability = await getPensionStatementImportCapability();
  if (!capability.enabled) {
    return c.json(
      { error: capability.message, reason: capability.reason },
      HTTP_STATUS.SERVICE_UNAVAILABLE,
    );
  }

  const formData = await c.req.formData();
  const potId = parseId(String(formData.get('potId') ?? ''));
  if (potId === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);

  const file = asFile(formData.get('file'));
  if (!file) return c.json({ error: 'A PDF file is required' }, HTTP_STATUS.BAD_REQUEST);

  const validation = validateUploadedPdf(file);
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

  const storageKey = buildPdfStorageKey({
    userId: user.id,
    pathSegments: ['pensions', potId, 'imports'],
  });
  const safeFileName = normalizePdfFileName(file.name, 'annual-statement');
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
    await deleteStoredPdfSafely(storageKey, PENSION_IMPORT_PDF_CONTEXT);
    console.error('Failed to persist pension statement import metadata', error);
    return c.json({ error: 'Failed to create import' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const importId = parseId(c.req.param('id'));
  if (importId === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);

  const importRecord = await findOwnedRow(pensionStatementImports, importId, user.id);
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

  const importRecord = await findOwnedRow(pensionStatementImports, importId, user.id);
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
    const importRecord = await findOwnedRow(pensionStatementImports, importId, user.id);
    if (!importRecord) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);
    return c.json({ error: 'Import is not editable' }, HTTP_STATUS.BAD_REQUEST);
  }

  const existing = await getImportRow(importId, rowId);
  if (!existing) return c.json({ error: 'Import row not found' }, HTTP_STATUS.NOT_FOUND);

  const rawBody = await readJsonBody(c.req, 'Invalid import row payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseEditableImportRowPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No import row fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const validated = validateEditableRowUpdate({
    importRecord: editableImport,
    existingRow: existing,
    body: body.value,
  });
  if (!validated.ok) return c.json({ error: validated.error }, HTTP_STATUS.BAD_REQUEST);

  const now = new Date();
  const [updated] = await db
    .update(pensionStatementImportRows)
    .set({
      type: validated.value.type,
      amount: validated.value.amount,
      taxAmount: validated.value.taxAmount,
      date: validated.value.date,
      note: validated.value.note,
      isEmployer: validated.value.isEmployer,
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

  const importRecord = await findOwnedRow(pensionStatementImports, importId, user.id);
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

  const importRecord = await findOwnedRow(pensionStatementImports, importId, user.id);
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

  const importRecord = await findOwnedRow(pensionStatementImports, importId, user.id);
  if (!importRecord) return c.json({ error: 'Import not found' }, HTTP_STATUS.NOT_FOUND);
  if (importRecord.status !== 'ready_for_review')
    return c.json({ error: IMPORT_NOT_READY_FOR_COMMIT }, HTTP_STATUS.BAD_REQUEST);

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
  let committedTransactionIds: number[];

  try {
    committedTransactionIds = await commitRowsToLedger({
      userId: user.id,
      importRecord,
      importId,
      rows,
      now,
    });
  } catch (error) {
    if (error instanceof ImportNotReadyForCommit) {
      return c.json({ error: IMPORT_NOT_READY_FOR_COMMIT }, HTTP_STATUS.BAD_REQUEST);
    }
    console.error('Failed to commit pension import', error);
    return c.json({ error: 'Failed to commit import' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  const committedImport = await findOwnedRow(pensionStatementImports, importId, user.id);
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

  const importRecord = await findOwnedRow(pensionStatementImports, importId, user.id);
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

  await deleteStoredPdfSafely(importRecord.storageKey, PENSION_IMPORT_PDF_CONTEXT);

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

const STORAGE_CLEANUP_UPDATE_BATCH_SIZE = 1000;

async function markImportStorageDeleted(ids: number[], now: Date): Promise<void> {
  for (let offset = 0; offset < ids.length; offset += STORAGE_CLEANUP_UPDATE_BATCH_SIZE) {
    await db
      .update(pensionStatementImports)
      .set({ storageDeletedAt: now })
      .where(
        and(
          eq(pensionStatementImports.status, 'expired'),
          inArray(
            pensionStatementImports.id,
            ids.slice(offset, offset + STORAGE_CLEANUP_UPDATE_BATCH_SIZE),
          ),
        ),
      );
  }
}

async function expireDraftImports(): Promise<void> {
  const now = new Date();
  const expired = await db
    .update(pensionStatementImports)
    .set({
      status: 'expired',
      updatedAt: now,
      errorMessage: 'Draft expired after retention period',
    })
    .where(
      and(
        sql`${pensionStatementImports.status} in ('queued', 'processing', 'ready_for_review', 'expired')`,
        isNull(pensionStatementImports.storageDeletedAt),
        lte(pensionStatementImports.expiresAt, now),
      ),
    )
    .returning({ id: pensionStatementImports.id, storageKey: pensionStatementImports.storageKey });
  try {
    const result = await deleteS3Objects(expired.map((row) => row.storageKey));
    const deleted = new Set(result.deletedKeys);
    const ids = expired.filter((row) => deleted.has(row.storageKey)).map((row) => row.id);
    await markImportStorageDeleted(ids, now);
  } catch (error) {
    console.error('Failed to delete expired pension import PDFs', error);
  }
}

export async function runPensionImportWorkerTick(): Promise<void> {
  await expireDraftImports();
  await processQueuedImport();
}

export default app;
