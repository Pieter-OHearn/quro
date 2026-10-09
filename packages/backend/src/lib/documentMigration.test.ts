import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FAKE_S3_CONNECTION, FakeS3Client } from '../test/fakeS3';
import {
  migrateDocumentsFromS3,
  STAGING_DIRECTORY_NAME,
  type DocumentReference,
} from './documentMigration';
import { DocumentDirectoryError } from './filesystemDocumentStore';
import { createS3DocumentStore } from './s3';

const encoder = new TextEncoder();
const pdf = (label: string) => encoder.encode(`%PDF-1.4\n%synthetic ${label}\n`);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const PAYSLIP = 'users/1/salary/payslips/10/11111111-1111-4111-8111-111111111111.pdf';
const STATEMENT =
  'users/1/pensions/2/annual-statements/20/22222222-2222-4222-8222-222222222222.pdf';
const QUEUED_IMPORT = 'users/1/pensions/2/imports/33333333-3333-4333-8333-333333333333.pdf';
const CANCELLED_IMPORT = 'users/1/pensions/2/imports/44444444-4444-4444-8444-444444444444.pdf';

let directory: string;
let s3: FakeS3Client;

function reference(key: string, overrides: Partial<DocumentReference> = {}): DocumentReference {
  const bytes = s3.objects.get(key);
  return {
    key,
    source: `rows#${key.length}`,
    needed: true,
    expectedSize: bytes ? bytes.byteLength : null,
    expectedSha256: null,
    ...overrides,
  };
}

function seed() {
  s3.objects.set(PAYSLIP, pdf('payslip'));
  s3.objects.set(STATEMENT, pdf('statement'));
  s3.objects.set(QUEUED_IMPORT, pdf('queued import'));
  return [
    reference(PAYSLIP, { source: 'payslips#10' }),
    reference(STATEMENT, { source: 'pension_transactions#20' }),
    reference(QUEUED_IMPORT, {
      source: 'pension_statement_imports#30 (queued)',
      expectedSha256: sha256(pdf('queued import')),
    }),
  ];
}

function migrate(references: DocumentReference[]) {
  return migrateDocumentsFromS3({
    references,
    source: createS3DocumentStore(FAKE_S3_CONNECTION, s3.asSender()),
    directory,
  });
}

const finalPath = (key: string) => join(directory, ...key.split('/'));
const stagingPath = (key: string) =>
  join(directory, STAGING_DIRECTORY_NAME, 'objects', ...key.split('/'));

/** Every file below the documents directory, outside the staging area. */
function liveFiles(): string[] {
  return (readdirSync(directory, { recursive: true }) as string[])
    .filter((path) => !path.startsWith(STAGING_DIRECTORY_NAME))
    .filter((path) => existsSync(join(directory, path)) && !readdirSafe(join(directory, path)))
    .sort();
}

function readdirSafe(path: string): string[] | null {
  try {
    return readdirSync(path);
  } catch {
    return null;
  }
}

function expectS3Unchanged(before: Map<string, Uint8Array>) {
  expect(s3.commands.filter((name) => name !== 'GetObject')).toEqual([]);
  expect([...s3.objects.entries()]).toEqual([...before.entries()]);
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'quro-migrate-'));
  s3 = new FakeS3Client();
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('migrate-from-s3', () => {
  test('copies every referenced object under the same key and leaves S3 as it was', async () => {
    const references = seed();
    const before = new Map(s3.objects);

    const report = await migrate(references);

    expect(report.failures).toEqual([]);
    expect(report.copied.sort()).toEqual([PAYSLIP, QUEUED_IMPORT, STATEMENT].sort());
    for (const key of [PAYSLIP, STATEMENT, QUEUED_IMPORT]) {
      expect(new Uint8Array(readFileSync(finalPath(key)))).toEqual(
        new Uint8Array(s3.objects.get(key)!),
      );
    }
    expect(existsSync(join(directory, STAGING_DIRECTORY_NAME))).toBe(false);
    expectS3Unchanged(before);
  });

  test('a key shared by an import and its transaction is copied once', async () => {
    const references = seed();
    references.push(
      reference(STATEMENT, { source: 'pension_statement_imports#40 (committed)', needed: false }),
    );
    const report = await migrate(references);
    expect(report.objects).toBe(3);
    expect(s3.gets.filter((key) => key === STATEMENT)).toHaveLength(1);
  });

  describe('a missing object', () => {
    test('that the application reads stops the run and adds nothing', async () => {
      const references = seed();
      s3.objects.delete(STATEMENT);

      const report = await migrate(references);

      expect(report.failures).toEqual([
        { key: STATEMENT, reason: 'missing from S3', sources: ['pension_transactions#20'] },
      ]);
      expect(report.copied).toEqual([]);
      expect(liveFiles()).toEqual([]);
      // The other copies are verified and staged for the next run.
      expect(existsSync(stagingPath(PAYSLIP))).toBe(true);
    });

    test('that nothing reads any more is reported and does not stop the run', async () => {
      const references = seed();
      references.push(
        reference(CANCELLED_IMPORT, {
          source: 'pension_statement_imports#50 (cancelled)',
          needed: false,
          expectedSize: 10,
        }),
      );

      const report = await migrate(references);

      expect(report.failures).toEqual([]);
      expect(report.skipped).toEqual([
        {
          key: CANCELLED_IMPORT,
          reason: 'missing from S3; the application no longer reads it',
          sources: ['pension_statement_imports#50 (cancelled)'],
        },
      ]);
      expect(report.copied).toHaveLength(3);
    });
  });

  describe('a checksum mismatch', () => {
    test('against the size the database recorded stops the run', async () => {
      const references = seed();
      s3.objects.set(PAYSLIP, pdf('payslip, changed after upload'));

      const report = await migrate(references);

      expect(report.failures).toHaveLength(1);
      expect(report.failures[0]).toMatchObject({ key: PAYSLIP, sources: ['payslips#10'] });
      expect(report.failures[0]?.reason).toStartWith('checksum mismatch: S3 returned');
      expect(liveFiles()).toEqual([]);
      expect(existsSync(stagingPath(PAYSLIP))).toBe(false);
    });

    test('against the SHA-256 recorded at upload stops the run', async () => {
      const references = seed();
      // Same length, different content.
      const original = s3.objects.get(QUEUED_IMPORT)!;
      const tampered = new Uint8Array(original);
      tampered[tampered.length - 2] = tampered[tampered.length - 2]! ^ 1;
      s3.objects.set(QUEUED_IMPORT, tampered);

      const report = await migrate(references);

      expect(report.failures).toEqual([
        {
          key: QUEUED_IMPORT,
          reason: 'checksum mismatch: the SHA-256 differs from the one recorded at upload',
          sources: ['pension_statement_imports#30 (queued)'],
        },
      ]);
      expect(liveFiles()).toEqual([]);
    });

    test('with a different file already at the key never overwrites it', async () => {
      const references = seed();
      mkdirSync(dirname(finalPath(PAYSLIP)), { recursive: true });
      writeFileSync(finalPath(PAYSLIP), 'something else');

      const report = await migrate(references);

      expect(report.failures).toEqual([
        {
          key: PAYSLIP,
          reason: 'checksum mismatch: a different file is already in the documents directory',
          sources: ['payslips#10'],
        },
      ]);
      expect(readFileSync(finalPath(PAYSLIP), 'utf8')).toBe('something else');
      expect(existsSync(finalPath(STATEMENT))).toBe(false);
    });
  });

  describe('an interrupted run', () => {
    test('resumes after a failed download without fetching verified copies again', async () => {
      const references = seed();
      s3.failGet = (key) =>
        key === STATEMENT ? Object.assign(new Error('reset'), { code: 'ECONNRESET' }) : undefined;

      const first = await migrate(references);
      expect(first.failures).toEqual([
        {
          key: STATEMENT,
          reason: 'could not be read from S3 (ECONNRESET)',
          sources: ['pension_transactions#20'],
        },
      ]);
      expect(liveFiles()).toEqual([]);

      s3.failGet = () => undefined;
      s3.gets.length = 0;
      const second = await migrate(references);

      expect(second.failures).toEqual([]);
      expect(s3.gets).toEqual([STATEMENT]);
      expect(second.copied.sort()).toEqual([PAYSLIP, QUEUED_IMPORT, STATEMENT].sort());
      expect(existsSync(join(directory, STAGING_DIRECTORY_NAME))).toBe(false);
    });

    test('downloads again a copy whose write was cut off before it was recorded', async () => {
      const references = seed();
      s3.failGet = (key) => (key === STATEMENT ? new Error('stop') : undefined);
      await migrate(references);

      // A process killed mid-copy: a temporary file, and a staged copy with no progress record.
      const stagedPayslip = stagingPath(PAYSLIP);
      writeFileSync(join(dirname(stagedPayslip), '.partial.pdf.1234.tmp'), '%PDF-1.4 trunc');
      const progressPath = join(directory, STAGING_DIRECTORY_NAME, 'progress.json');
      const progress = JSON.parse(readFileSync(progressPath, 'utf8'));
      delete progress.objects[PAYSLIP];
      writeFileSync(progressPath, JSON.stringify(progress));
      writeFileSync(stagedPayslip, '%PDF-1.4 trunc');

      s3.failGet = () => undefined;
      s3.gets.length = 0;
      const report = await migrate(references);

      expect(report.failures).toEqual([]);
      expect(s3.gets.sort()).toEqual([PAYSLIP, STATEMENT].sort());
      expect(new Uint8Array(readFileSync(finalPath(PAYSLIP)))).toEqual(pdf('payslip'));
      expect(existsSync(join(directory, STAGING_DIRECTORY_NAME))).toBe(false);
    });

    test('finishes moving copies into place after being stopped half way', async () => {
      const references = seed();
      s3.failGet = (key) => (key === STATEMENT ? new Error('stop') : undefined);
      await migrate(references);
      // The previous run had moved one copy into place when it stopped.
      mkdirSync(dirname(finalPath(PAYSLIP)), { recursive: true });
      renameSync(stagingPath(PAYSLIP), finalPath(PAYSLIP));

      s3.failGet = () => undefined;
      const report = await migrate(references);

      expect(report.failures).toEqual([]);
      expect(report.alreadyPresent).toEqual([PAYSLIP]);
      expect(report.copied.sort()).toEqual([QUEUED_IMPORT, STATEMENT].sort());
    });
  });

  test('running again after a successful run changes nothing', async () => {
    const references = seed();
    await migrate(references);
    const before = new Map(s3.objects);
    s3.commands.length = 0;

    const report = await migrate(references);

    expect(report).toMatchObject({ copied: [], failures: [], skipped: [] });
    expect(report.alreadyPresent.sort()).toEqual([PAYSLIP, QUEUED_IMPORT, STATEMENT].sort());
    expectS3Unchanged(before);
  });

  test('a document uploaded to the filesystem after the switch counts as present', async () => {
    const references = seed();
    await migrate(references);
    const later = 'users/1/salary/payslips/11/55555555-5555-4555-8555-555555555555.pdf';
    mkdirSync(dirname(finalPath(later)), { recursive: true });
    writeFileSync(finalPath(later), pdf('uploaded later'));

    const report = await migrate([...references, reference(later)]);

    expect(report.failures).toEqual([]);
    expect(report.alreadyPresent).toContain(later);
  });

  test('a key that is not a safe relative path is refused', async () => {
    s3.objects.set('../outside.pdf', pdf('outside'));
    const report = await migrate([reference('../outside.pdf', { source: 'payslips#99' })]);
    expect(report.failures).toEqual([
      {
        key: '../outside.pdf',
        reason: 'the key is not a safe relative path, so it cannot be stored as a file',
        sources: ['payslips#99'],
      },
    ]);
    expect(existsSync(join(directory, '..', 'outside.pdf'))).toBe(false);
  });

  test('refuses to start without the documents directory', async () => {
    rmSync(directory, { recursive: true });
    await expect(migrate(seed())).rejects.toBeInstanceOf(DocumentDirectoryError);
    mkdirSync(directory);
  });
});
