import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { payslips, pensionPots, pensionStatementImports, pensionTransactions } from '../db/schema';
import { createS3DocumentStore } from '../lib/s3';
import { applyTestSettings, writeTestSecret } from '../test/config';
import { FakeS3Client } from '../test/fakeS3';
import { createIntegrationHelpers } from '../test/integration';
import { readDocumentReferences, runDocumentsCommand } from './documents';
import { EXIT_FAILURE, EXIT_OK, EXIT_UNAVAILABLE, EXIT_USAGE } from './io';
import { runQuro } from './quro';

const integration = createIntegrationHelpers('documents-cli.integration.quro.test');
const encoder = new TextEncoder();
const pdf = (label: string) => encoder.encode(`%PDF-1.4\n%synthetic ${label}\n`);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

let userId: number;
let directory: string;
let s3: FakeS3Client;
let restoreSettings: (() => void) | undefined;
const keys: Record<'payslip' | 'statement' | 'queued' | 'cancelled' | 'deleted', string> = {
  payslip: '',
  statement: '',
  queued: '',
  cancelled: '',
  deleted: '',
};

function s3Settings(extra: Record<string, string | undefined> = {}) {
  return {
    QRO_DOCUMENT_STORAGE: 's3',
    QRO_DOCUMENTS_DIR: directory,
    S3_ENDPOINT: 'http://s3.test.invalid:9000',
    S3_REGION: 'test-region',
    S3_BUCKET: 'quro-test-documents',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY_FILE: writeTestSecret('s3_secret_access_key', 'test-secret-key'),
    ...extra,
  };
}

async function run(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const exitCode = await runDocumentsCommand(
    args,
    { out: (line) => out.push(line), err: (line) => err.push(line) },
    {
      createSource: (connection) => createS3DocumentStore(connection, s3.asSender()),
      // The test database is shared with other suites; copy only this suite's documents.
      readReferences: async () =>
        (await readDocumentReferences()).filter((r) => r.key.startsWith(`users/${userId}/`)),
    },
  );
  return { exitCode, out: out.join('\n'), err: err.join('\n') };
}

async function quro(...args: string[]) {
  const err: string[] = [];
  const exitCode = await runQuro(args, { out: () => undefined, err: (line) => err.push(line) });
  return { exitCode, err: err.join('\n') };
}

async function snapshotRows() {
  return {
    payslips: await db.select().from(payslips).where(eq(payslips.userId, userId)),
    transactions: await db
      .select()
      .from(pensionTransactions)
      .where(eq(pensionTransactions.userId, userId)),
    imports: await db
      .select()
      .from(pensionStatementImports)
      .where(eq(pensionStatementImports.userId, userId)),
  };
}

beforeAll(async () => {
  await integration.cleanup();
  userId = (await integration.signUp('owner')).user.id;
  const [pot] = await db
    .insert(pensionPots)
    .values({
      userId,
      name: 'Synthetic pot',
      provider: 'Synthetic provider',
      type: 'Personal Pension',
      balance: 0,
      currency: 'EUR',
      employeeMonthly: 0,
      employerMonthly: 0,
    })
    .returning();
  const base = `users/${userId}`;
  keys.payslip = `${base}/salary/payslips/1/11111111-1111-4111-8111-111111111111.pdf`;
  keys.statement = `${base}/pensions/${pot!.id}/imports/22222222-2222-4222-8222-222222222222.pdf`;
  keys.queued = `${base}/pensions/${pot!.id}/imports/33333333-3333-4333-8333-333333333333.pdf`;
  keys.cancelled = `${base}/pensions/${pot!.id}/imports/44444444-4444-4444-8444-444444444444.pdf`;
  keys.deleted = `${base}/pensions/${pot!.id}/imports/55555555-5555-4555-8555-555555555555.pdf`;
  const now = new Date('2026-10-01T12:00:00.000Z');
  const document = (key: string) => ({
    documentStorageKey: key,
    documentFileName: 'synthetic.pdf',
    documentSizeBytes: pdf(key).byteLength,
    documentUploadedAt: now,
  });

  await db.insert(payslips).values({
    userId,
    month: '2026-09',
    date: '2026-09-25',
    gross: 1000,
    tax: 100,
    pension: 50,
    net: 850,
    currency: 'EUR',
    ...document(keys.payslip),
  });
  // A committed import and the annual statement it created share one object.
  await db.insert(pensionTransactions).values({
    userId,
    potId: pot!.id,
    type: 'annual_statement',
    amount: 0,
    taxAmount: 0,
    date: '2026-01-01',
    ...document(keys.statement),
  });
  const importRow = (key: string, status: 'queued' | 'committed' | 'cancelled' | 'expired') => ({
    userId,
    potId: pot!.id,
    status,
    storageKey: key,
    fileName: 'synthetic.pdf',
    mimeType: 'application/pdf',
    sizeBytes: pdf(key).byteLength,
    fileHashSha256: sha256(pdf(key)),
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
  });
  await db
    .insert(pensionStatementImports)
    .values([
      importRow(keys.statement, 'committed'),
      importRow(keys.queued, 'queued'),
      importRow(keys.cancelled, 'cancelled'),
      { ...importRow(keys.deleted, 'expired'), storageDeletedAt: now },
    ]);
});

afterAll(async () => {
  await integration.cleanup();
});

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'quro-documents-cli-'));
  s3 = new FakeS3Client();
  // The cancelled import's object was deleted by the application, as cancelling does.
  for (const key of [keys.payslip, keys.statement, keys.queued]) s3.objects.set(key, pdf(key));
  restoreSettings = applyTestSettings(s3Settings());
});

afterEach(() => {
  restoreSettings?.();
  rmSync(directory, { recursive: true, force: true });
});

describe('reading document references', () => {
  test('lists every object a row refers to and marks what the application still reads', async () => {
    const references = (await readDocumentReferences()).filter((r) =>
      r.key.startsWith(`users/${userId}/`),
    );
    const summary = references
      .map(({ key, needed, source }) => ({
        key,
        needed,
        table: source.split('#')[0],
      }))
      .sort((a, b) => `${a.key}${a.table}`.localeCompare(`${b.key}${b.table}`));

    expect(summary).toEqual(
      [
        { key: keys.payslip, needed: true, table: 'payslips' },
        { key: keys.statement, needed: true, table: 'pension_transactions' },
        { key: keys.statement, needed: false, table: 'pension_statement_imports' },
        { key: keys.queued, needed: true, table: 'pension_statement_imports' },
        { key: keys.cancelled, needed: false, table: 'pension_statement_imports' },
      ].sort((a, b) => `${a.key}${a.table}`.localeCompare(`${b.key}${b.table}`)),
    );
    // An import whose object was already deleted is not referenced.
    expect(references.some((r) => r.key === keys.deleted)).toBe(false);
    const queued = references.find((r) => r.key === keys.queued)!;
    expect(queued.expectedSha256).toBe(sha256(pdf(keys.queued)));
    expect(queued.expectedSize).toBe(pdf(keys.queued).byteLength);
  });
});

describe('quro documents migrate-from-s3', () => {
  test('copies every needed document, changes no row and leaves S3 untouched', async () => {
    const rowsBefore = await snapshotRows();

    const result = await run('migrate-from-s3');

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.out).toContain(
      'Done: 4 documents referenced, 3 copied, 0 already present, 1 skipped.',
    );
    expect(result.out).toContain('Set QRO_DOCUMENT_STORAGE=filesystem');
    for (const key of [keys.payslip, keys.statement, keys.queued]) {
      expect(new Uint8Array(readFileSync(join(directory, ...key.split('/'))))).toEqual(pdf(key));
    }
    expect(await snapshotRows()).toEqual(rowsBefore);
    expect(s3.commands.filter((name) => !['HeadBucket', 'GetObject'].includes(name))).toEqual([]);
    expect(s3.objects.size).toBe(3);
    // Keys and row ids only: no file names.
    expect(`${result.out}${result.err}`).not.toContain('synthetic.pdf');
  });

  test('a missing needed document stops the run with exit code 1 and adds nothing', async () => {
    s3.objects.delete(keys.payslip);

    const result = await run('migrate-from-s3');

    expect(result.exitCode).toBe(EXIT_FAILURE);
    expect(result.out).toContain(`failed   ${keys.payslip}: missing from S3 (payslips#`);
    expect(result.err).toContain('Stopped: 1 of 4 documents could not be copied');
    expect(result.err).toContain('Keep QRO_DOCUMENT_STORAGE=s3');
    expect(existsSync(join(directory, 'users'))).toBe(false);
  });

  test('an unreachable store stops before anything is read, with exit code 4', async () => {
    s3.bucketReachable = false;
    const result = await run('migrate-from-s3');
    expect(result.exitCode).toBe(EXIT_UNAVAILABLE);
    expect(result.err).toContain('The S3 store cannot be reached (ECONNREFUSED)');
    expect(s3.gets).toEqual([]);
  });

  test('without the S3 settings there is nothing to copy from: exit code 2', async () => {
    restoreSettings?.();
    restoreSettings = applyTestSettings({
      QRO_DOCUMENT_STORAGE: 'filesystem',
      QRO_DOCUMENTS_DIR: directory,
      S3_ENDPOINT: undefined,
      S3_REGION: undefined,
      S3_BUCKET: undefined,
      S3_ACCESS_KEY_ID: undefined,
      S3_SECRET_ACCESS_KEY_FILE: undefined,
    });
    const result = await run('migrate-from-s3');
    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.err).toContain('The S3 store to copy from is not configured');
  });

  test('also runs with QRO_DOCUMENT_STORAGE=filesystem, once the switch is made', async () => {
    restoreSettings?.();
    restoreSettings = applyTestSettings(s3Settings({ QRO_DOCUMENT_STORAGE: 'filesystem' }));
    expect((await run('migrate-from-s3')).exitCode).toBe(EXIT_OK);
    expect((await run('migrate-from-s3')).out).toContain('0 copied, 3 already present');
  });

  test('rejects unknown arguments', async () => {
    expect((await quro('documents', 'migrate-from-s3', '--force')).exitCode).toBe(EXIT_USAGE);
    expect((await quro('documents', 'copy')).exitCode).toBe(EXIT_USAGE);
  });
});

describe('S3 settings without QRO_DOCUMENT_STORAGE', () => {
  test('stop every quro command with exit code 2 and say what to set', async () => {
    restoreSettings?.();
    restoreSettings = applyTestSettings(s3Settings({ QRO_DOCUMENT_STORAGE: undefined }));
    for (const command of [
      ['documents', 'migrate-from-s3'],
      ['user', 'status'],
    ]) {
      const result = await quro(...command);
      expect(result.exitCode).toBe(EXIT_USAGE);
      expect(result.err).toContain('QRO_DOCUMENT_STORAGE: required because S3_ENDPOINT');
      expect(result.err).not.toContain('test-secret-key');
    }
  });
});
