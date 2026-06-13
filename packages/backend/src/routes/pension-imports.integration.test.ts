import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';

const s3Objects = new Map<string, Uint8Array>();
let pensionImportCapabilityEnabled = true;

await mock.module('../lib/s3', () => ({
  S3ConfigurationError: class MockS3ConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'S3ConfigurationError';
    }
  },
  getS3BucketName: () => 'pension-imports-test-bucket',
  checkS3Readiness: () => Promise.resolve(),
  uploadS3Object: ({ key, body }: { key: string; body: Buffer }) => {
    s3Objects.set(key, new Uint8Array(body));
  },
  getS3ObjectBytes: ({ key }: { key: string }) => {
    const existing = s3Objects.get(key);
    return existing ? Buffer.from(existing) : null;
  },
  deleteS3Object: ({ key }: { key: string }) => {
    s3Objects.delete(key);
  },
}));

await mock.module('../lib/capabilities', () => ({
  getPensionStatementImportCapability: () =>
    Promise.resolve({
      enabled: pensionImportCapabilityEnabled,
      reason: pensionImportCapabilityEnabled ? null : 'worker_unavailable',
      message: pensionImportCapabilityEnabled ? 'AI import is available.' : 'AI import disabled',
      checkedAt: new Date('2026-03-01T12:00:00.000Z').toISOString(),
    }),
}));

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
  const response = await integration.request('/api/pension-imports', {
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
  const response = await integration.request(`/api/pension-imports/${importId}/rows`, { cookie });
  const body = await parseJson<ApiDataResponse<ImportRowResponse[]>>(response, 200);
  return body.data;
}

describe('pension imports integration', () => {
  beforeAll(async () => {
    await integration.cleanup();
  });

  afterAll(async () => {
    s3Objects.clear();
    mock.clearAllMocks();
    mock.restore();
    await integration.cleanup();
  });

  test('uploads, reviews, edits, commits, and blocks cancelling committed imports', async () => {
    const owner = await integration.signUp('owner');
    const potId = await createPensionPot(owner.cookie);
    const uploadBody = await uploadImport(owner.cookie, potId);

    expect(uploadBody.data.status).toBe('queued');
    await runPensionImportWorkerTick();

    const detailResponse = await integration.request(`/api/pension-imports/${uploadBody.data.id}`, {
      cookie: owner.cookie,
    });
    const detailBody = await parseJson<ApiDataResponse<ImportResponse>>(detailResponse, 200);
    expect(detailBody.data.status).toBe('ready_for_review');
    expect(detailBody.data.statementPeriodStart).toBe('2025-01-01');

    const rows = await getImportRows(owner.cookie, uploadBody.data.id);
    const contributionRow = rows.find((row) => row.type === 'contribution');
    expect(contributionRow).toBeDefined();

    const patchResponse = await integration.request(
      `/api/pension-imports/${uploadBody.data.id}/rows/${contributionRow!.id}`,
      {
        method: 'PATCH',
        cookie: owner.cookie,
        json: { amount: 1200, taxAmount: 200, isEmployer: false },
      },
    );
    const patchBody = await parseJson<ApiDataResponse<ImportRowResponse>>(patchResponse, 200);
    expect(patchBody.data.amount).toBe(1200);

    const commitResponse = await integration.request(
      `/api/pension-imports/${uploadBody.data.id}/commit`,
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

    const cancelResponse = await integration.request(`/api/pension-imports/${uploadBody.data.id}`, {
      method: 'DELETE',
      cookie: owner.cookie,
    });
    expect(cancelResponse.status).toBe(400);
    expect(await cancelResponse.json()).toEqual({ error: 'Committed imports cannot be cancelled' });
  });

  test('rejects duplicate uploads for the same pot and PDF bytes', async () => {
    const owner = await integration.signUp('duplicate-owner');
    const potId = await createPensionPot(owner.cookie, 'Duplicate Pension');
    await uploadImport(owner.cookie, potId, 'same-bytes');

    const duplicateResponse = await integration.request('/api/pension-imports', {
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

    const response = await integration.request('/api/pension-imports', {
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
      integration.request(`/api/pension-imports/${uploadBody.data.id}`, {
        cookie: stranger.cookie,
      }),
      integration.request(`/api/pension-imports/${uploadBody.data.id}/rows/${row.id}`, {
        method: 'PATCH',
        cookie: stranger.cookie,
        json: { amount: 900 },
      }),
      integration.request(`/api/pension-imports/${uploadBody.data.id}/commit`, {
        method: 'POST',
        cookie: stranger.cookie,
      }),
      integration.request(`/api/pension-imports/${uploadBody.data.id}`, {
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
      `/api/pension-imports/${uploadBody.data.id}/commit`,
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
      `/api/pension-imports/${uploadBody.data.id}/commit`,
      { method: 'POST', cookie: owner.cookie },
    );
    expect(twoAnnualResponse.status).toBe(400);
    expect(await twoAnnualResponse.json()).toEqual({
      error: 'Exactly one annual statement row is required before commit',
    });
  });
});
