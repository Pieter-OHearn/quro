import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import type { DocumentStorageConfig, Secret } from '../config';
import {
  bundledMigrations,
  compareSchema,
  lastMigration,
  readAppliedMigrations,
  type AppliedMigration,
  type BundledMigration,
} from '../db/migrationState';
import { checkPgDump, createDatabaseBackup } from '../db/pgTools';
import { readAppVersion } from '../lib/appVersion';
import { enterMaintenance, leaveMaintenance } from '../lib/maintenanceMode';
import { archiveName, partialName } from './archiveNames';
import { EncryptingSink } from './encryption';
import {
  FileSink,
  fileChunks,
  hashing,
  listDocumentFiles,
  publishFile,
  removeQuietly,
  sha256Hex,
} from './files';
import { readDatabaseFingerprint, type DatabaseFingerprint } from './fingerprint';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_FORMAT_VERSION,
  DATABASE_ENTRY,
  DOCUMENTS_PREFIX,
  MANIFEST_ENTRY,
  SECRETS_IN_ARCHIVE,
  SECRETS_NOT_IN_ARCHIVE,
  type DocumentFile,
  type DocumentsSection,
  type Manifest,
  type ReferencedDocument,
} from './manifest';
import { TarWriter } from './tar';
import { scanArchive } from './verifyArchive';

// `quro backup`: one archive with a custom-format dump, the documents (filesystem storage) or the
// list of documents the database refers to (S3 storage), and a manifest. While the dump and the
// documents are copied, maintenance mode refuses changes, so the two are from the same moment.
// The archive is written under a hidden temporary name, read back and checked against its
// manifest, and only then renamed into place.

const SESSION_CLOSE_SECONDS = 5;
const MANIFEST_INDENT = 2;
const MILLISECONDS_PER_SECOND = 1000;

export class BackupDirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupDirectoryError';
  }
}

/** The database was migrated by a newer release than this image. */
export class SchemaNewerThanImageError extends Error {
  constructor(tag: string | null) {
    super(
      `The database has a migration this image does not know (${tag ?? 'unknown'}); it was migrated by a newer release. Run the backup with the image that matches the database.`,
    );
    this.name = 'SchemaNewerThanImageError';
  }
}

export type BackupRequest = {
  adminUrl: string;
  documentStorage: DocumentStorageConfig;
  encryptionKey: Secret | null;
  directory: string;
  label: string | null;
  /** How long to wait for running writes and job cycles before giving up. */
  waitSeconds: number;
  /** True for the pre-restore archive: the restore already holds maintenance mode. */
  maintenanceHeld: boolean;
  log: (line: string) => void;
  signal?: AbortSignal;
};

export type BackupDependencies = {
  dump: typeof createDatabaseBackup;
  checkDump: (connectionString: string) => Promise<void>;
  now: () => Date;
  appVersion: string | null;
  migrations: readonly BundledMigration[];
};

export function defaultBackupDependencies(): BackupDependencies {
  return {
    dump: createDatabaseBackup,
    checkDump: checkPgDump,
    now: () => new Date(),
    appVersion: readAppVersion(),
    migrations: bundledMigrations(),
  };
}

export type WrittenArchive = {
  path: string;
  name: string;
  bytes: number;
  sha256: string;
  manifest: Manifest;
};

type Snapshot = {
  serverVersion: string;
  fingerprint: DatabaseFingerprint;
  applied: AppliedMigration[] | null;
  references: (ReferencedDocument & { needed: boolean })[] | null;
};

type Paths = { name: string; final: string; partial: string; dump: string };

/** The directory exists, is a directory and can be written to. */
export async function assertWritableDirectory(directory: string, what: string): Promise<void> {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) {
    throw new BackupDirectoryError(
      `The ${what} ${directory} does not exist. Create it, or mount a volume there; Quro does not create it.`,
    );
  }
  await access(directory, constants.W_OK).catch(() => {
    throw new BackupDirectoryError(`The ${what} ${directory} is not writable by this user.`);
  });
}

async function assertDocumentsDirectory(directory: string): Promise<void> {
  const info = await stat(directory).catch(() => null);
  if (!info?.isDirectory()) {
    throw new BackupDirectoryError(
      `The documents directory ${directory} (QRO_DOCUMENTS_DIR) does not exist, so the documents cannot be backed up. Nothing was written.`,
    );
  }
}

function planPaths(request: BackupRequest, createdAt: Date): Paths {
  const name = archiveName(createdAt, request.label, request.encryptionKey !== null);
  return {
    name,
    final: join(request.directory, name),
    partial: join(request.directory, partialName(name)),
    dump: join(request.directory, `.${name}.dump.partial`),
  };
}

const REFERENCES_SQL = `
  select 'payslips#' || id as source, document_storage_key as key,
    document_size_bytes as bytes, null::text as sha256, true as needed
  from payslips where document_storage_key is not null
  union all
  select 'pension_transactions#' || id, document_storage_key, document_size_bytes, null, true
  from pension_transactions where document_storage_key is not null
  union all
  select 'pension_statement_imports#' || id, storage_key, size_bytes, file_hash_sha256,
    status in ('queued', 'processing', 'ready_for_review')
  from pension_statement_imports where storage_deleted_at is null
  order by 2`;

/** The documents the database refers to, or null when the schema has no such tables yet. */
async function readReferences(tx: TransactionSql): Promise<Snapshot['references']> {
  try {
    return await tx.savepoint((savepoint) =>
      savepoint.unsafe<(ReferencedDocument & { needed: boolean })[]>(REFERENCES_SQL),
    );
  } catch {
    return null;
  }
}

/** Reads what the manifest records and runs pg_dump, all from one exported snapshot. */
function captureSnapshot(
  session: Sql,
  request: BackupRequest,
  dependencies: BackupDependencies,
  dumpPath: string,
): Promise<Snapshot> {
  return session.begin('isolation level repeatable read read only', async (tx) => {
    const [exported] = await tx<{ id: string; version: string }[]>`
      select pg_export_snapshot() as id, current_setting('server_version') as version
    `;
    const fingerprint = await readDatabaseFingerprint(tx);
    const applied = await readAppliedMigrations(tx);
    const references = await readReferences(tx);
    request.log('Dumping the database');
    await dependencies.dump({
      connectionString: request.adminUrl,
      outputPath: dumpPath,
      snapshot: exported!.id,
      signal: request.signal,
      log: () => undefined,
    });
    return { serverVersion: exported!.version, fingerprint, applied, references };
  });
}

async function addFileEntry(
  tar: TarWriter,
  entry: string,
  path: string,
): Promise<{ bytes: number; sha256: string }> {
  const { size } = await stat(path);
  const hash = createHash('sha256');
  await tar.addFile(entry, size, hashing(fileChunks(path), hash));
  return { bytes: size, sha256: sha256Hex(hash) };
}

async function addDocuments(
  tar: TarWriter,
  directory: string,
  snapshot: Snapshot,
  request: BackupRequest,
): Promise<DocumentsSection> {
  const listing = await listDocumentFiles(directory);
  if (listing.skipped.length > 0) {
    request.log(
      `Skipped ${listing.skipped.length} file(s) in the documents directory that are not documents Quro stores.`,
    );
  }
  const files: DocumentFile[] = [];
  for (const key of listing.keys) {
    request.signal?.throwIfAborted();
    files.push({
      key,
      ...(await addFileEntry(tar, `${DOCUMENTS_PREFIX}${key}`, join(directory, key))),
    });
  }
  const present = new Set(listing.keys);
  const missing = (snapshot.references ?? [])
    .filter((reference) => reference.needed && !present.has(reference.key))
    .map((reference) => reference.key);
  return {
    driver: 'filesystem',
    included: true,
    count: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
    missing,
  };
}

function s3Documents(snapshot: Snapshot): DocumentsSection {
  return {
    driver: 's3',
    included: false,
    note: 'Documents are kept in the S3 store and are not in this archive. Copy the bucket with your store tools; `referenced` lists every object the database refers to.',
    referenced: (snapshot.references ?? []).map(({ key, source, bytes, sha256 }) => ({
      key,
      source,
      bytes,
      sha256,
    })),
  };
}

function buildManifest(
  request: BackupRequest,
  dependencies: BackupDependencies,
  parts: {
    createdAt: Date;
    snapshot: Snapshot;
    dump: { bytes: number; sha256: string };
    documents: DocumentsSection;
  },
): Manifest {
  const { snapshot } = parts;
  return {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_FORMAT_VERSION,
    createdAt: parts.createdAt.toISOString(),
    label: request.label,
    app: { version: dependencies.appVersion },
    database: {
      entry: DATABASE_ENTRY,
      ...parts.dump,
      serverVersion: snapshot.serverVersion,
      lastMigration: lastMigration(snapshot.applied, dependencies.migrations),
      appliedMigrations: snapshot.applied?.length ?? 0,
      fingerprint: snapshot.fingerprint,
    },
    documents: parts.documents,
    secrets: {
      encrypted: request.encryptionKey !== null,
      inArchive: SECRETS_IN_ARCHIVE,
      notInArchive: SECRETS_NOT_IN_ARCHIVE,
    },
  };
}

async function writeArchiveFile(
  paths: Paths,
  request: BackupRequest,
  dependencies: BackupDependencies,
  parts: { createdAt: Date; snapshot: Snapshot },
): Promise<{ bytes: number; sha256: string; manifest: Manifest }> {
  const file = await FileSink.create(paths.partial);
  try {
    const sink = request.encryptionKey
      ? await EncryptingSink.open(file, request.encryptionKey)
      : file;
    const tar = new TarWriter(sink, parts.createdAt);
    const dump = await addFileEntry(tar, DATABASE_ENTRY, paths.dump);
    const { documentStorage } = request;
    request.log(
      documentStorage.driver === 'filesystem'
        ? `Adding the documents from ${documentStorage.directory}`
        : 'Listing the documents in the S3 store (not copied)',
    );
    const documents =
      documentStorage.driver === 'filesystem'
        ? await addDocuments(tar, documentStorage.directory, parts.snapshot, request)
        : s3Documents(parts.snapshot);
    const manifest = buildManifest(request, dependencies, { ...parts, dump, documents });
    const manifestText = `${JSON.stringify(manifest, null, MANIFEST_INDENT)}\n`;
    await tar.addBytes(MANIFEST_ENTRY, new TextEncoder().encode(manifestText));
    await tar.finish();
    if (sink instanceof EncryptingSink) await sink.finish();
    const sha256 = await file.close();
    return { bytes: file.bytes, sha256, manifest };
  } catch (error) {
    await file.abandon();
    throw error;
  }
}

/** Refuses a database migrated by a newer release, before anything is paused or written. */
async function checkSchema(session: Sql, dependencies: BackupDependencies): Promise<void> {
  const state = compareSchema(await readAppliedMigrations(session), dependencies.migrations);
  if (state.kind === 'ahead') throw new SchemaNewerThanImageError(state.last.tag);
}

/** Dumps and archives with changes paused, then turns them back on. */
async function writeWhilePaused(
  session: Sql,
  paths: Paths,
  request: BackupRequest,
  dependencies: BackupDependencies,
  createdAt: Date,
) {
  if (!request.maintenanceHeld) {
    request.log(
      `Pausing changes: new changes are refused from now on; waiting up to ${request.waitSeconds} s for running ones to finish`,
    );
    await enterMaintenance(session, request.waitSeconds);
  }
  const pausedAt = performance.now();
  try {
    const snapshot = await captureSnapshot(session, request, dependencies, paths.dump);
    return await writeArchiveFile(paths, request, dependencies, { createdAt, snapshot });
  } finally {
    if (!request.maintenanceHeld) {
      await leaveMaintenance(session).catch(() => undefined);
      const seconds = (performance.now() - pausedAt) / MILLISECONDS_PER_SECOND;
      request.log(`Changes resumed after ${seconds.toFixed(1)} s`);
    }
  }
}

/**
 * Writes, verifies and publishes one archive. Nothing is left behind when it fails: the hidden
 * temporary files are removed and maintenance mode ends with the session.
 */
export async function writeBackupArchive(
  request: BackupRequest,
  dependencies: BackupDependencies = defaultBackupDependencies(),
): Promise<WrittenArchive> {
  await assertWritableDirectory(request.directory, 'backup directory');
  if (request.documentStorage.driver === 'filesystem') {
    await assertDocumentsDirectory(request.documentStorage.directory);
  }
  const createdAt = dependencies.now();
  const paths = planPaths(request, createdAt);
  const session = postgres(request.adminUrl, {
    max: 1,
    onnotice: () => undefined,
    connection: { application_name: 'quro-backup' },
  });
  let written: { bytes: number; sha256: string; manifest: Manifest };
  try {
    await checkSchema(session, dependencies);
    await dependencies.checkDump(request.adminUrl);
    written = await writeWhilePaused(session, paths, request, dependencies, createdAt);
    request.log('Verifying the archive');
    await scanArchive(paths.partial, request.encryptionKey);
    await publishFile(paths.partial, paths.final, request.directory);
  } catch (error) {
    await removeQuietly(paths.partial);
    throw error;
  } finally {
    await removeQuietly(paths.dump);
    await session.end({ timeout: SESSION_CLOSE_SECONDS }).catch(() => undefined);
  }
  return { path: paths.final, name: paths.name, ...written };
}
