import { createHash } from 'node:crypto';
import { appendFile, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isValidDocumentKey, type DocumentStore } from './documentStore';
import {
  assertUsableDirectory,
  ensureParentDirectory,
  isMissingPathError,
  resolveDocumentPath,
  syncDirectory,
  writeFileAtomically,
} from './filesystemDocumentStore';

// `quro documents migrate-from-s3`: copies every object the database refers to from the S3 store
// into the filesystem store, under the same key. It reads objects through the S3 API, so a store
// that encrypts at rest works, and it never writes to or deletes from S3. No database row changes:
// the keys are the same in both stores, and the operator switches QRO_DOCUMENT_STORAGE afterwards.
//
// Copies are made in two phases. Each object is first downloaded into a staging directory inside
// the documents directory, flushed, read back and compared by SHA-256 with what S3 returned (and
// with the size and hash the database recorded at upload). Only when every needed object has a
// verified copy are the copies moved into place, so a failed run adds nothing to the documents
// directory. Verified copies stay staged and are appended to a progress log; the next run checks
// them again and downloads only what is missing, so an interrupted run resumes.

export const STAGING_DIRECTORY_NAME = '.migrate-from-s3';
const PROGRESS_FILE_NAME = 'progress.jsonl';

export type DocumentReference = {
  key: string;
  /** The row that refers to the object, such as `payslips#12`. Never a file name or an amount. */
  source: string;
  /**
   * The application can still read the object. A missing needed object stops the migration; a
   * missing object that nothing reads any more (a cancelled or expired import) is reported only.
   */
  needed: boolean;
  /** Size recorded when the document was uploaded. */
  expectedSize: number | null;
  /** SHA-256 recorded when the document was uploaded, where the table keeps one. */
  expectedSha256: string | null;
};

export type MigrationIssue = { key: string; reason: string; sources: string[] };

export type MigrationReport = {
  /** Distinct keys the database refers to. */
  objects: number;
  /** Moved into the documents directory by this run. */
  copied: string[];
  /** Already in the documents directory with the same content as in S3, or only there. */
  alreadyPresent: string[];
  /** Not needed by the application and missing from S3. */
  skipped: MigrationIssue[];
  /** Needed and not copied. When any exist, nothing was moved into the documents directory. */
  failures: MigrationIssue[];
};

type MigrationSource = Pick<DocumentStore, 'get'>;

type KeyPlan = {
  key: string;
  needed: boolean;
  sources: string[];
  expectedSizes: Set<number>;
  expectedHashes: Set<string>;
};

type Progress = Map<string, string>;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const { name, code } = error as { name?: unknown; code?: unknown };
    if (typeof code === 'string') return code;
    if (typeof name === 'string' && name !== 'Error') return name;
  }
  return 'unknown error';
}

function plan(references: readonly DocumentReference[]): KeyPlan[] {
  const byKey = new Map<string, KeyPlan>();
  for (const reference of references) {
    const entry = byKey.get(reference.key) ?? {
      key: reference.key,
      needed: false,
      sources: [],
      expectedSizes: new Set<number>(),
      expectedHashes: new Set<string>(),
    };
    entry.needed ||= reference.needed;
    entry.sources.push(reference.source);
    if (reference.expectedSize !== null) entry.expectedSizes.add(reference.expectedSize);
    if (reference.expectedSha256 !== null) {
      entry.expectedHashes.add(reference.expectedSha256.toLowerCase());
    }
    byKey.set(reference.key, entry);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

async function readFileIfPresent(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
}

/** Verified staged copies by key: one JSON line per copy, appended as each one is made. */
async function readProgress(path: string): Promise<Progress> {
  const progress: Progress = new Map();
  const raw = await readFileIfPresent(path);
  for (const line of raw ? raw.toString('utf8').split('\n') : []) {
    // A line cut off by an interrupted run is skipped; that copy is downloaded again.
    try {
      const entry = JSON.parse(line) as { key?: unknown; sha256?: unknown };
      if (typeof entry.key === 'string' && typeof entry.sha256 === 'string') {
        progress.set(entry.key, entry.sha256);
      }
    } catch {
      // See above.
    }
  }
  return progress;
}

/** Why the bytes S3 returned do not match what the database recorded, or null when they do. */
function recordMismatch(entry: KeyPlan, bytes: Uint8Array, digest: string): string | null {
  const sizes = [...entry.expectedSizes];
  if (sizes.some((size) => size !== bytes.byteLength)) {
    return `checksum mismatch: S3 returned ${bytes.byteLength} bytes, the database recorded ${sizes.join(' and ')}`;
  }
  if ([...entry.expectedHashes].some((hash) => hash !== digest)) {
    return 'checksum mismatch: the SHA-256 differs from the one recorded at upload';
  }
  return null;
}

type Outcome =
  | { kind: 'present' }
  | { kind: 'staged'; digest: string }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; reason: string };

const failed = (reason: string): Outcome => ({ kind: 'failed', reason });

const UNSAFE_KEY = 'the key is not a safe relative path, so it cannot be stored as a file';
const DIFFERENT_FILE_IN_PLACE =
  'checksum mismatch: a different file is already in the documents directory';
const READ_BACK_MISMATCH = 'checksum mismatch: the copy read back differs from what S3 returned';
const NOT_NEEDED_AND_MISSING = 'missing from S3; the application no longer reads it';

/** One run: the documents directory, its staging area and the S3 source. */
class Migration {
  private readonly stagingObjects: string;
  private readonly progressPath: string;

  private constructor(
    readonly directory: string,
    readonly stagingRoot: string,
    private readonly source: MigrationSource,
    private readonly progress: Progress,
  ) {
    this.stagingObjects = join(stagingRoot, 'objects');
    this.progressPath = join(stagingRoot, PROGRESS_FILE_NAME);
  }

  static async open(directory: string, source: MigrationSource): Promise<Migration> {
    await assertUsableDirectory(directory);
    const stagingRoot = join(directory, STAGING_DIRECTORY_NAME);
    const progress = await readProgress(join(stagingRoot, PROGRESS_FILE_NAME));
    return new Migration(directory, stagingRoot, source, progress);
  }

  /** Phase 1 for one key: an identical file already in place, or a verified staged copy. */
  async prepare(entry: KeyPlan): Promise<Outcome> {
    if (!isValidDocumentKey(entry.key)) return failed(UNSAFE_KEY);
    const existing = await readFileIfPresent(resolveDocumentPath(this.directory, entry.key));
    if (existing) return this.compareInPlace(entry.key, existing);
    const recorded = await this.verifiedStagedDigest(entry.key);
    if (recorded) return { kind: 'staged', digest: recorded };
    return this.download(entry);
  }

  /** Phase 2 for one key: moves the staged copy into place. Never overwrites a file. */
  async promote(key: string, digest: string): Promise<'copied' | 'present' | 'conflict'> {
    const finalPath = resolveDocumentPath(this.directory, key);
    const stagedPath = resolveDocumentPath(this.stagingObjects, key);
    await ensureParentDirectory(this.directory, finalPath);
    const existing = await readFileIfPresent(finalPath);
    if (existing) {
      // Only possible when something wrote the key after phase 1.
      if (sha256(existing) !== digest) return 'conflict';
      await rm(stagedPath, { force: true });
      return 'present';
    }
    await rename(stagedPath, finalPath);
    await syncDirectory(dirname(finalPath));
    return 'copied';
  }

  async removeStaging(): Promise<void> {
    await rm(this.stagingRoot, { recursive: true, force: true });
  }

  private async fetch(key: string): Promise<{ bytes: Buffer | null } | { error: string }> {
    try {
      return { bytes: await this.source.get(key) };
    } catch (error) {
      return { error: `could not be read from S3 (${describeError(error)})` };
    }
  }

  // Already in place from an earlier run, or uploaded after the switch to the filesystem.
  private async compareInPlace(key: string, existing: Buffer): Promise<Outcome> {
    const fetched = await this.fetch(key);
    if ('error' in fetched) return failed(fetched.error);
    if (fetched.bytes && sha256(fetched.bytes) !== sha256(existing)) {
      return failed(DIFFERENT_FILE_IN_PLACE);
    }
    return { kind: 'present' };
  }

  private async verifiedStagedDigest(key: string): Promise<string | null> {
    const recorded = this.progress.get(key);
    if (!recorded) return null;
    const staged = await readFileIfPresent(resolveDocumentPath(this.stagingObjects, key));
    return staged && sha256(staged) === recorded ? recorded : null;
  }

  private async download(entry: KeyPlan): Promise<Outcome> {
    const fetched = await this.fetch(entry.key);
    if ('error' in fetched) return failed(fetched.error);
    if (!fetched.bytes) {
      return entry.needed
        ? failed('missing from S3')
        : { kind: 'skipped', reason: NOT_NEEDED_AND_MISSING };
    }
    const digest = sha256(fetched.bytes);
    const mismatch = recordMismatch(entry, fetched.bytes, digest);
    if (mismatch) return failed(mismatch);
    return this.stage(entry.key, fetched.bytes, digest);
  }

  private async stage(key: string, bytes: Buffer, digest: string): Promise<Outcome> {
    const stagedPath = resolveDocumentPath(this.stagingObjects, key);
    try {
      await ensureParentDirectory(this.directory, stagedPath);
      await writeFileAtomically(stagedPath, bytes);
      if (sha256(await readFile(stagedPath)) !== digest) {
        await rm(stagedPath, { force: true });
        return failed(READ_BACK_MISMATCH);
      }
    } catch (error) {
      return failed(`could not be written to the documents directory (${describeError(error)})`);
    }
    // Appended, not rewritten: the log grows by one line per copy whatever the number of objects.
    // A line lost to a crash only means that copy is downloaded again.
    await appendFile(this.progressPath, `${JSON.stringify({ key, sha256: digest })}\n`, {
      mode: 0o600,
    });
    this.progress.set(key, digest);
    return { kind: 'staged', digest };
  }
}

type Log = (line: string) => void;

function record(
  report: MigrationReport,
  entry: KeyPlan,
  outcome: Outcome,
  log: Log,
  staged: { key: string; digest: string }[],
): void {
  const sources = entry.sources.join(', ');
  switch (outcome.kind) {
    case 'present':
      report.alreadyPresent.push(entry.key);
      return;
    case 'staged':
      staged.push({ key: entry.key, digest: outcome.digest });
      return;
    case 'skipped':
      report.skipped.push({ key: entry.key, reason: outcome.reason, sources: entry.sources });
      log(`  skipped  ${entry.key}: ${outcome.reason} (${sources})`);
      return;
    case 'failed':
      report.failures.push({ key: entry.key, reason: outcome.reason, sources: entry.sources });
      log(`  failed   ${entry.key}: ${outcome.reason} (${sources})`);
  }
}

export async function migrateDocumentsFromS3(params: {
  references: readonly DocumentReference[];
  source: MigrationSource;
  /** The filesystem store's directory (QRO_DOCUMENTS_DIR). */
  directory: string;
  log?: Log;
}): Promise<MigrationReport> {
  const log = params.log ?? (() => undefined);
  const migration = await Migration.open(params.directory, params.source);
  const entries = plan(params.references);
  const report: MigrationReport = {
    objects: entries.length,
    copied: [],
    alreadyPresent: [],
    skipped: [],
    failures: [],
  };

  // Phase 1: a verified copy of every key, staged or already in place.
  const staged: { key: string; digest: string }[] = [];
  for (const entry of entries) record(report, entry, await migration.prepare(entry), log, staged);
  if (report.failures.length > 0) return report;

  // Phase 2: every needed object has a verified copy; move the copies into place.
  for (const { key, digest } of staged) {
    const result = await migration.promote(key, digest);
    if (result === 'copied') {
      report.copied.push(key);
      log(`  copied   ${key}`);
    } else if (result === 'present') {
      report.alreadyPresent.push(key);
    } else {
      const entry = entries.find((candidate) => candidate.key === key)!;
      record(report, entry, failed(DIFFERENT_FILE_IN_PLACE), log, staged);
    }
  }
  if (report.failures.length === 0) await migration.removeStaging();
  return report;
}
