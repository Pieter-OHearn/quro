import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';

import { createMemoryDocumentStore } from '../test/memoryDocumentStore';

const documents = createMemoryDocumentStore();
const { objects: storedDocuments, failedDeletionKeys, deletionRequests } = documents;
let pensionImportCapabilityEnabled = true;

// mock.module replaces modules for the whole bun process; keep the real ones so
// afterAll can put them back before later test files (e.g. bunq) run.
const realDocumentStorage = { ...(await import('../lib/documentStorage')) };
const realCapabilities = { ...(await import('../lib/capabilities')) };
const realPensionParserClient = { ...(await import('../lib/pensionParserClient')) };

await mock.module('../lib/documentStorage', () => ({
  ...realDocumentStorage,
  getDocumentStore: () => documents.store,
}));

await mock.module('../lib/capabilities', () => {
  const getPensionStatementImportCapability = () =>
    Promise.resolve({
      enabled: pensionImportCapabilityEnabled,
      reason: pensionImportCapabilityEnabled ? null : 'worker_unavailable',
      message: pensionImportCapabilityEnabled ? 'AI import is available.' : 'AI import disabled',
      checkedAt: new Date('2026-03-01T12:00:00.000Z').toISOString(),
    });
  return {
    getPensionStatementImportCapability,
    getAppCapabilities: async () => {
      const pensionStatementImport = await getPensionStatementImportCapability();
      return { ai: pensionStatementImport, pensionStatementImport };
    },
  };
});

await mock.module('../lib/pensionParserClient', () => ({
  parsePensionStatement: () =>
    Promise.resolve({
      statementPeriodStart: '2025-01-01',
      statementPeriodEnd: '2025-12-31',
      modelName: 'fixture-parser',
      modelVersion: '1.0.0',
      rows: [
        buildParserRow({ type: 'annual_statement', amount: 12500, date: '2025-12-31' }),
        buildParserRow({
          type: 'contribution',
          amount: 1000,
          taxAmount: 200,
          date: '2025-06-30',
          isEmployer: false,
        }),
      ],
    }),
}));

const { createIntegrationHelpers } = await import('../test/integration');
const { db } = await import('../db/client');
const { pensionStatementImportRows, pensionStatementImports, pensionTransactions } =
  await import('../db/schema');
const { runPensionImportWorkerTick } = await import('./pension-imports');

const integration = createIntegrationHelpers('pension-imports.integration.quro.test');

type ApiDataResponse<T> = { data: T };
type ImportResponse = {
  id: number;
  status: string;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
};
type ImportRowResponse = {
  id: number;
  type: string;
  amount: number;
  isDeleted: boolean;
  committedTransactionId: number | null;
};

function buildParserRow(overrides: {
  type: 'contribution' | 'fee' | 'annual_statement';
  amount: number;
  taxAmount?: number;
  date: string;
  isEmployer?: boolean | null;
}) {
  return {
    type: overrides.type,
    amount: overrides.amount,
    taxAmount: overrides.taxAmount ?? 0,
    date: overrides.date,
    note: `${overrides.type} fixture`,
    isEmployer: overrides.isEmployer ?? null,
    confidence: 0.98,
    confidenceLabel: 'high',
    evidence: [{ page: 1, snippet: `${overrides.type} evidence` }],
    isDerived: false,
  };
}

function buildPdfFile(fileName: string, suffix = '') {
  return new File(
    [Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n${suffix}\n%%EOF\n`)],
    fileName,
    { type: 'application/pdf' },
  );
}

function buildUploadForm(potId: number, fileName: string, suffix = '') {
  const form = new FormData();
  form.set('potId', String(potId));
  form.set('file', buildPdfFile(fileName, suffix));
  return form;
}

async function parseJson<T>(response: Response, expectedStatus: number): Promise<T> {
  expect(response.status).toBe(expectedStatus);
  return (await response.json()) as T;
}

async function createPensionPot(cookie: string, name = 'Imported Pension') {
  const response = await integration.request('/api/pensions/pots', {
    method: 'POST',
    cookie,
    json: {
      name,
      provider: 'Aegon',
      type: 'Workplace Pension',
      balance: 0,
      currency: 'GBP',
      employeeMonthly: 100,
      employerMonthly: 150,
      investmentStrategy: 'Balanced',
      color: '#1d4ed8',
      emoji: 'P',
    },
  });
  const body = await parseJson<ApiDataResponse<{ id: number }>>(response, 201);
  return body.data.id;
}

async function uploadImport(cookie: string, potId: number, suffix = '') {
  const response = await integration.request('/api/pensions/imports', {
    method: 'POST',
    cookie,
    body: buildUploadForm(potId, `statement-${suffix || 'base'}.pdf`, suffix),
  });
  return parseJson<ApiDataResponse<ImportResponse>>(response, 201);
}

async function markReady(importId: number, rows: Array<{ type: string; amount: number }>) {
  await db
    .delete(pensionStatementImportRows)
    .where(eq(pensionStatementImportRows.importId, importId));
  await db.insert(pensionStatementImportRows).values(
    rows.map((row, index) => ({
      importId,
      rowOrder: index,
      type: row.type,
      amount: row.amount,
      taxAmount: 0,
      date: `2025-12-${String(index + 1).padStart(2, '0')}`,
      note: `${row.type} row`,
      isEmployer: row.type === 'contribution' ? false : null,
      confidence: 0.9,
      confidenceLabel: 'high' as const,
      evidence: [],
      isDerived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
  await db
    .update(pensionStatementImports)
    .set({ status: 'ready_for_review', updatedAt: new Date() })
    .where(eq(pensionStatementImports.id, importId));
}

async function getImportRows(cookie: string, importId: number) {
  const response = await integration.request(`/api/pensions/imports/${importId}/rows`, { cookie });
  const body = await parseJson<ApiDataResponse<ImportRowResponse[]>>(response, 200);
  return body.data;
}

describe('pension imports integration', () => {
  beforeAll(async () => {
    await integration.cleanup();
  });

  afterAll(async () => {
    storedDocuments.clear();
    mock.clearAllMocks();
    mock.restore();
    await mock.module('../lib/documentStorage', () => realDocumentStorage);
    await mock.module('../lib/capabilities', () => realCapabilities);
    await mock.module('../lib/pensionParserClient', () => realPensionParserClient);
    await integration.cleanup();
  });

  test('uploads, reviews, edits, commits, and blocks cancelling committed imports', async () => {
    const owner = await integration.signUp('owner');
    const potId = await createPensionPot(owner.cookie);
    const uploadBody = await uploadImport(owner.cookie, potId);

    expect(uploadBody.data.status).toBe('queued');
    await runPensionImportWorkerTick();

    const detailResponse = await integration.request(
      `/api/pensions/imports/${uploadBody.data.id}`,
      {
        cookie: owner.cookie,
      },
    );
    const detailBody = await parseJson<ApiDataResponse<ImportResponse>>(detailResponse, 200);
    expect(detailBody.data.status).toBe('ready_for_review');
    expect(detailBody.data.statementPeriodStart).toBe('2025-01-01');

    const rows = await getImportRows(owner.cookie, uploadBody.data.id);
    const contributionRow = rows.find((row) => row.type === 'contribution');
    expect(contributionRow).toBeDefined();

    const patchResponse = await integration.request(
      `/api/pensions/imports/${uploadBody.data.id}/rows/${contributionRow!.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { amount: 1200, taxAmount: 200, isEmployer: false },
      },
    );
    const patchBody = await parseJson<ApiDataResponse<ImportRowResponse>>(patchResponse, 200);
    expect(patchBody.data.amount).toBe(1200);

    const commitResponse = await integration.request(
      `/api/pensions/imports/${uploadBody.data.id}/commit`,
      {
        method: 'POST',
        cookie: owner.cookie,
      },
    );
    const commitBody = await parseJson<ApiDataResponse<{ transactionIds: number[] }>>(
      commitResponse,
      200,
    );
    expect(commitBody.data.transactionIds).toHaveLength(2);

    const committedRows = await getImportRows(owner.cookie, uploadBody.data.id);
    expect(committedRows.every((row) => row.committedTransactionId !== null)).toBe(true);

    const transactions = await db
      .select()
      .from(pensionTransactions)
      .where(inArray(pensionTransactions.id, commitBody.data.transactionIds));
    expect(transactions).toHaveLength(2);

    const cancelResponse = await integration.request(
      `/api/pensions/imports/${uploadBody.data.id}`,
      {
        method: 'DELETE',
        cookie: owner.cookie,
      },
    );
    expect(cancelResponse.status).toBe(400);
    expect(await cancelResponse.json()).toEqual({ error: 'Committed imports cannot be cancelled' });
  });

  test('rejects duplicate uploads for the same pot and PDF bytes', async () => {
    const owner = await integration.signUp('duplicate-owner');
    const potId = await createPensionPot(owner.cookie, 'Duplicate Pension');
    await uploadImport(owner.cookie, potId, 'same-bytes');

    const duplicateResponse = await integration.request('/api/pensions/imports', {
      method: 'POST',
      cookie: owner.cookie,
      body: buildUploadForm(potId, 'same-again.pdf', 'same-bytes'),
    });

    expect(duplicateResponse.status).toBe(409);
    expect(await duplicateResponse.json()).toEqual({
      error: 'An import for this statement already exists for this pension pot',
    });
  });

  test('rejects uploads when the import capability is disabled', async () => {
    const owner = await integration.signUp('disabled-owner');
    const potId = await createPensionPot(owner.cookie, 'Disabled Pension');
    pensionImportCapabilityEnabled = false;

    const response = await integration.request('/api/pensions/imports', {
      method: 'POST',
      cookie: owner.cookie,
      body: buildUploadForm(potId, 'disabled.pdf', 'disabled'),
    });

    pensionImportCapabilityEnabled = true;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'AI import disabled',
      reason: 'worker_unavailable',
    });
  });

  test('hides another user import from get, patch, commit, and cancel requests', async () => {
    const owner = await integration.signUp('ownership-owner');
    const stranger = await integration.signUp('ownership-stranger');
    const potId = await createPensionPot(owner.cookie, 'Ownership Pension');
    const uploadBody = await uploadImport(owner.cookie, potId, 'ownership');
    await markReady(uploadBody.data.id, [{ type: 'annual_statement', amount: 1000 }]);
    const [row] = await getImportRows(owner.cookie, uploadBody.data.id);

    const requests = await Promise.all([
      integration.request(`/api/pensions/imports/${uploadBody.data.id}`, {
        cookie: stranger.cookie,
      }),
      integration.request(`/api/pensions/imports/${uploadBody.data.id}/rows/${row.id}`, {
        method: 'PATCH',
        cookie: stranger.cookie,
        json: { amount: 900 },
      }),
      integration.request(`/api/pensions/imports/${uploadBody.data.id}/commit`, {
        method: 'POST',
        cookie: stranger.cookie,
      }),
      integration.request(`/api/pensions/imports/${uploadBody.data.id}`, {
        method: 'DELETE',
        cookie: stranger.cookie,
      }),
    ]);

    expect(requests.map((response) => response.status)).toEqual([404, 404, 404, 404]);
  });

  test('rejects commit when active rows do not contain exactly one annual statement', async () => {
    const owner = await integration.signUp('validation-owner');
    const potId = await createPensionPot(owner.cookie, 'Validation Pension');
    const uploadBody = await uploadImport(owner.cookie, potId, 'validation');

    await markReady(uploadBody.data.id, [{ type: 'contribution', amount: 100 }]);
    const noAnnualResponse = await integration.request(
      `/api/pensions/imports/${uploadBody.data.id}/commit`,
      { method: 'POST', cookie: owner.cookie },
    );
    expect(noAnnualResponse.status).toBe(400);
    expect(await noAnnualResponse.json()).toEqual({
      error: 'Exactly one annual statement row is required before commit',
    });

    await markReady(uploadBody.data.id, [
      { type: 'annual_statement', amount: 1000 },
      { type: 'annual_statement', amount: 1100 },
    ]);
    const twoAnnualResponse = await integration.request(
      `/api/pensions/imports/${uploadBody.data.id}/commit`,
      { method: 'POST', cookie: owner.cookie },
    );
    expect(twoAnnualResponse.status).toBe(400);
    expect(await twoAnnualResponse.json()).toEqual({
      error: 'Exactly one annual statement row is required before commit',
    });
  });

  test('expires drafts in a batch while retaining committed PDFs', async () => {
    const owner = await integration.signUp('expired-drafts');
    const potId = await createPensionPot(owner.cookie, 'Expired drafts');
    const past = new Date(Date.now() - 60000);
    const statuses = ['queued', 'processing', 'ready_for_review', 'committed'] as const;
    const rows = await db
      .insert(pensionStatementImports)
      .values(
        statuses.map((status) => ({
          userId: owner.user.id,
          potId,
          status,
          expiresAt: past,
          storageKey: `expired-draft-${owner.user.id}-${status}`,
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          fileHashSha256: crypto.randomUUID(),
        })),
      )
      .returning();
    for (const row of rows) storedDocuments.set(row.storageKey, new Uint8Array([1]));
    await runPensionImportWorkerTick();
    const updated = await db
      .select()
      .from(pensionStatementImports)
      .where(eq(pensionStatementImports.userId, owner.user.id));
    expect(updated.filter((row) => row.status === 'expired')).toHaveLength(3);
    expect(updated.filter((row) => row.status === 'committed')).toHaveLength(1);
    for (const row of rows)
      expect(storedDocuments.has(row.storageKey)).toBe(row.status === 'committed');
  });

  test('retries failed deletions on later ticks and skips completed cleanup', async () => {
    const owner = await integration.signUp('cleanup-retry');
    const potId = await createPensionPot(owner.cookie, 'Cleanup retry');
    const rows = await db
      .insert(pensionStatementImports)
      .values(
        ['expired', 'queued'].map((status, index) => ({
          userId: owner.user.id,
          potId,
          status: status as 'expired' | 'queued',
          expiresAt: new Date(Date.now() - 60000),
          storageKey: `cleanup-retry-${owner.user.id}-${index}`,
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          fileHashSha256: crypto.randomUUID(),
        })),
      )
      .returning();
    const failed = rows[0];
    const successful = rows[1];
    for (const row of rows) storedDocuments.set(row.storageKey, new Uint8Array([1]));
    failedDeletionKeys.add(failed.storageKey);
    deletionRequests.length = 0;
    try {
      await runPensionImportWorkerTick();
      const first = await db
        .select()
        .from(pensionStatementImports)
        .where(eq(pensionStatementImports.userId, owner.user.id));
      expect(first.find((row) => row.id === failed.id)).toMatchObject({
        status: 'expired',
        storageDeletedAt: null,
      });
      expect(first.find((row) => row.id === successful.id)?.storageDeletedAt).toBeInstanceOf(Date);
      expect(storedDocuments.has(failed.storageKey)).toBe(true);
      expect(storedDocuments.has(successful.storageKey)).toBe(false);
      failedDeletionKeys.clear();
      deletionRequests.length = 0;
      await runPensionImportWorkerTick();
      expect(deletionRequests.flat()).toContain(failed.storageKey);
      expect(deletionRequests.flat()).not.toContain(successful.storageKey);
      const [retried] = await db
        .select()
        .from(pensionStatementImports)
        .where(eq(pensionStatementImports.id, failed.id));
      expect(retried.storageDeletedAt).toBeInstanceOf(Date);
      expect(storedDocuments.has(failed.storageKey)).toBe(false);
      deletionRequests.length = 0;
      await runPensionImportWorkerTick();
      expect(deletionRequests.flat()).not.toContain(failed.storageKey);
    } finally {
      failedDeletionKeys.clear();
    }
  });
});
