import { Hono } from 'hono';
import { db } from '../db/client';
import { pensionPots, pensionTransactions } from '../db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';
import { getS3ObjectBytes } from '../lib/s3';
import {
  asFile,
  buildPdfStorageKey,
  deleteStoredPdfSafely,
  isS3NotFoundError,
  PDF_MIME_TYPE,
  readInlinePdfDocument,
  uploadPdfFile,
  validateUploadedPdf,
} from '../lib/pdfDocuments';

const app = new Hono();
const MAX_INT32 = 2_147_483_647;
const TRANSACTION_TYPES = ['contribution', 'fee', 'annual_statement'] as const;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PensionTransactionType = (typeof TRANSACTION_TYPES)[number];

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

function parseId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_INT32) return null;
  return parsed;
}

function normalizeBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
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

async function findOwnedTransactionRow(
  tx: DbTransaction,
  userId: number,
  transactionId: number,
): Promise<typeof pensionTransactions.$inferSelect | null> {
  const [transaction] = await tx
    .select()
    .from(pensionTransactions)
    .where(and(eq(pensionTransactions.id, transactionId), eq(pensionTransactions.userId, userId)));
  return transaction ?? null;
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
  const transaction = await db.transaction((tx) =>
    findOwnedTransactionRow(tx, params.userId, params.transactionId),
  );

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
}): Promise<string | null> {
  if (params.previousType === 'annual_statement' && params.nextType !== 'annual_statement') {
    const [transaction] = await params.tx
      .select()
      .from(pensionTransactions)
      .where(
        and(
          eq(pensionTransactions.id, params.transactionId),
          eq(pensionTransactions.userId, params.userId),
        ),
      );
    const document = transaction ? readInlinePdfDocument(transaction) : null;
    if (!document) return null;

    await params.tx
      .update(pensionTransactions)
      .set({
        documentStorageKey: null,
        documentFileName: null,
        documentSizeBytes: null,
        documentUploadedAt: null,
      })
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
      .values({ ...params.payload, userId: params.userId })
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
      .set(nextPayload)
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
  const body = await c.req.json();
  const [data] = await db
    .insert(pensionPots)
    .values({ ...body, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/pots/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(pensionPots)
    .set(safeBody)
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
  const body = await c.req.json();
  const raw = normalizeBody(body);
  const validated = validatePensionTransactionPayload({
    potId: raw.potId,
    type: raw.type,
    amount: raw.amount,
    taxAmount: raw.taxAmount ?? 0,
    date: raw.date,
    note: raw.note,
    isEmployer: raw.isEmployer,
  });
  if (!validated.ok) return c.json({ error: validated.error }, HTTP_STATUS.BAD_REQUEST);

  const result = await createPensionTransaction({ userId: user.id, payload: validated.data });
  if (isRouteMutationError(result)) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await c.req.json();
  const result = await updatePensionTransaction({
    userId: user.id,
    transactionId: id,
    raw: normalizeBody(body),
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

    c.header('Content-Type', PDF_MIME_TYPE);
    c.header('Content-Disposition', `inline; filename="${document.fileName}"`);
    return c.body(bytes);
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
    .set({
      documentStorageKey: null,
      documentFileName: null,
      documentSizeBytes: null,
      documentUploadedAt: null,
    })
    .where(and(eq(pensionTransactions.userId, user.id), eq(pensionTransactions.id, transactionId)));

  await deleteStoredPdfSafely(existingDocument.storageKey, 'pension statement PDF');
  return c.json({ data: formatStatementDocumentResponse(existingDocument) });
});

export default app;
