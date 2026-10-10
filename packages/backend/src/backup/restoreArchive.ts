import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import postgres, { type Sql } from 'postgres';
import type { BackupConfig, DocumentStorageConfig } from '../config';
import { readAppliedMigrations, type AppliedMigration } from '../db/migrationState';
import { checkPgRestore, restoreDatabaseBackup } from '../db/pgTools';
import { ensureRuntimeRole, type RuntimeRoleConfig } from '../db/runtimeRole';
import { enterMaintenance, leaveMaintenance } from '../lib/maintenanceMode';
import { PRE_RESTORE_LABEL } from './archiveNames';
import {
  assertWritableDirectory,
  BackupDirectoryError,
  defaultBackupDependencies,
  writeBackupArchive,
  type BackupDependencies,
  type WrittenArchive,
} from './createBackup';
import { FileSink, removeQuietly } from './files';
import { compareFingerprints, readDatabaseFingerprint } from './fingerprint';
import { assertRestorableBy, type Manifest } from './manifest';
import { summarizeProblems } from './problems';
import {
  checkRestoredDocuments,
  createDocumentStaging,
  hasDocuments,
  swapInStagedDocuments,
  type DocumentStaging,
} from './restoreDocuments';
import { scanArchive } from './verifyArchive';

// `quro restore <archive>`: checks the whole archive, refuses unless the operator confirmed and
// the target is safe to replace, writes a pre-restore archive of what is there, restores the
// database in one transaction and the documents by rename, and then compares the restored
// database and documents with the archive's manifest.

export const RESTORE_CONFIRMATION = 'restore-db';
const MAINTENANCE_WAIT_SECONDS = 10;
const SESSION_CLOSE_SECONDS = 5;

/** A guard refused: nothing was changed (exit code 3). */
export class RestoreRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreRefusedError';
  }
}

/** The restore ran, but the result does not match the archive. */
export class RestoreVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreVerificationError';
  }
}

export type RestoreRequest = {
  archivePath: string;
  adminUrl: string;
  runtimeRole: RuntimeRoleConfig | null;
  documentStorage: DocumentStorageConfig;
  backup: BackupConfig;
  confirm: string | null;
  allowNonEmpty: boolean;
  log: (line: string) => void;
  signal?: AbortSignal;
};

export type RestoreDependencies = BackupDependencies & {
  restore: typeof restoreDatabaseBackup;
  checkRestore: (connectionString: string) => Promise<void>;
};

export function defaultRestoreDependencies(): RestoreDependencies {
  return {
    ...defaultBackupDependencies(),
    restore: restoreDatabaseBackup,
    checkRestore: checkPgRestore,
  };
}

export type RestoreResult = {
  manifest: Manifest;
  preRestoreArchive: WrittenArchive | null;
  restoredDocuments: number;
  /** Migrations this image bundles beyond the archive's: run `quro migrate` for them. */
  pendingMigrations: number;
};

type TargetState = { applied: AppliedMigration[] | null; hasRows: boolean; hasTables: boolean };

async function readTargetState(session: Sql): Promise<TargetState> {
  const tables = await session<{ name: string }[]>`
    select quote_ident(tablename) as name from pg_tables where schemaname = 'public'
  `;
  let hasRows = false;
  for (const table of tables) {
    const [row] = await session.unsafe<{ found: boolean }[]>(
      `select exists(select 1 from public.${table.name}) as found`,
    );
    if (row?.found) {
      hasRows = true;
      break;
    }
  }
  return { applied: await readAppliedMigrations(session), hasRows, hasTables: tables.length > 0 };
}

async function assertNoOtherSessions(session: Sql): Promise<void> {
  const [row] = await session<{ count: number }[]>`
    select count(*)::int as count from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid() and backend_type = 'client backend'
  `;
  if ((row?.count ?? 0) > 0) {
    throw new RestoreRefusedError(
      `Refusing to restore while other database sessions are connected (${row!.count}). Stop the backend, the import worker and any SQL client first.`,
    );
  }
}

/** The target must be a new database or one at the archive's migration. */
function assertSchemaMatches(state: TargetState, manifest: Manifest): void {
  const last = state.applied?.[state.applied.length - 1];
  if (!last && !state.hasTables) return;
  const archived = manifest.database.lastMigration;
  if (last && archived && last.createdAt === archived.createdAt) return;
  throw new RestoreRefusedError(
    `The database's schema is not the archive's (the archive is at migration ${archived?.tag ?? 'none'}). Restore into a new, empty database instead (do not run quro migrate before the restore), then run quro migrate.`,
  );
}

function assertConfirmed(request: RestoreRequest): void {
  if (request.confirm === RESTORE_CONFIRMATION) return;
  throw new RestoreRefusedError(
    `Refusing to restore. Set QRO_RESTORE_CONFIRM=${RESTORE_CONFIRMATION} after checking the target database and the archive.`,
  );
}

function assertDocumentsFit(manifest: Manifest, storage: DocumentStorageConfig): void {
  if (manifest.documents.included && storage.driver !== 'filesystem') {
    throw new BackupDirectoryError(
      'The archive holds documents for filesystem storage, but QRO_DOCUMENT_STORAGE is s3. Restore it into an instance with QRO_DOCUMENT_STORAGE=filesystem.',
    );
  }
}

async function guardTarget(
  session: Sql,
  request: RestoreRequest,
  manifest: Manifest,
): Promise<{ replacing: boolean }> {
  await assertNoOtherSessions(session);
  await enterMaintenance(session, MAINTENANCE_WAIT_SECONDS);
  const state = await readTargetState(session);
  assertSchemaMatches(state, manifest);
  const { documentStorage } = request;
  const documentsPresent =
    documentStorage.driver === 'filesystem' && (await hasDocuments(documentStorage.directory));
  const replacing = state.hasRows || documentsPresent;
  if (replacing && !request.allowNonEmpty) {
    throw new RestoreRefusedError(
      'Refusing to restore over a non-empty database or documents directory. Set QRO_RESTORE_ALLOW_NON_EMPTY=1 after verifying the target and your latest backup.',
    );
  }
  return { replacing };
}

type Staged = { dumpPath: string; documents: DocumentStaging | null };

/** Writes the archive's dump and documents to staging, checking every checksum again. */
async function stageArchive(request: RestoreRequest, manifest: Manifest): Promise<Staged> {
  const dumpPath = join(request.backup.directory, `.quro-restore-${randomUUID()}.dump`);
  const { documentStorage } = request;
  const documents =
    manifest.documents.included && documentStorage.driver === 'filesystem'
      ? await createDocumentStaging(documentStorage.directory)
      : null;
  const staged = { dumpPath, documents };
  try {
    await scanArchive(request.archivePath, request.backup.encryptionKey, {
      dump: async (chunks) => {
        const sink = await FileSink.create(dumpPath);
        for await (const chunk of chunks) await sink.write(chunk);
        await sink.close();
      },
      document: documents ? documents.write : undefined,
    });
    return staged;
  } catch (error) {
    await discardStaging(staged);
    throw error;
  }
}

async function discardStaging(staged: Staged): Promise<void> {
  await removeQuietly(staged.dumpPath);
  await staged.documents?.discard();
}

async function verifyRestored(
  session: Sql,
  request: RestoreRequest,
  manifest: Manifest,
): Promise<number> {
  const fingerprint = await session.begin((tx) => readDatabaseFingerprint(tx));
  const problems = compareFingerprints(manifest.database.fingerprint, fingerprint);
  const { documents } = manifest;
  if (documents.included && request.documentStorage.driver === 'filesystem') {
    problems.push(
      ...(await checkRestoredDocuments(request.documentStorage.directory, documents.files)),
    );
  }
  if (problems.length > 0) {
    throw new RestoreVerificationError(
      `The restored data does not match the archive: ${summarizeProblems(problems)}.`,
    );
  }
  return documents.included ? documents.count : 0;
}

function preRestoreArchive(
  request: RestoreRequest,
  dependencies: RestoreDependencies,
): Promise<WrittenArchive> {
  request.log('Writing a pre-restore archive of the current data');
  return writeBackupArchive(
    {
      adminUrl: request.adminUrl,
      documentStorage: request.documentStorage,
      encryptionKey: request.backup.encryptionKey,
      directory: request.backup.directory,
      label: PRE_RESTORE_LABEL,
      waitSeconds: 0,
      maintenanceHeld: true,
      log: request.log,
      signal: request.signal,
    },
    dependencies,
  );
}

async function replaceData(
  session: Sql,
  request: RestoreRequest,
  staged: Staged,
  dependencies: RestoreDependencies,
): Promise<void> {
  request.log('Restoring the database (one transaction)');
  await dependencies.restore({
    connectionString: request.adminUrl,
    inputPath: staged.dumpPath,
    signal: request.signal,
  });
  if (staged.documents && request.documentStorage.driver === 'filesystem') {
    request.log('Moving the restored documents into place');
    await swapInStagedDocuments(request.documentStorage.directory, staged.documents).catch(
      (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `The database was restored, but the documents could not be moved into place (${reason}). Run the same restore again with QRO_RESTORE_ALLOW_NON_EMPTY=1; the pre-restore archive holds the previous data.`,
          { cause: error },
        );
      },
    );
  }
  if (request.runtimeRole) {
    await ensureRuntimeRole(session, request.runtimeRole);
    request.log(`Re-applied the grants of the runtime role ${request.runtimeRole.roleName}`);
  }
}

function pendingMigrations(manifest: Manifest, dependencies: RestoreDependencies): number {
  const last = manifest.database.lastMigration?.createdAt ?? 0;
  return dependencies.migrations.filter((migration) => migration.createdAt > last).length;
}

async function checkPrerequisites(
  request: RestoreRequest,
  dependencies: RestoreDependencies,
): Promise<Manifest> {
  assertConfirmed(request);
  await assertWritableDirectory(request.backup.directory, 'backup directory');
  if (request.documentStorage.driver === 'filesystem') {
    await assertWritableDirectory(request.documentStorage.directory, 'documents directory');
  }
  request.log(`Checking ${request.archivePath}`);
  const { manifest } = await scanArchive(request.archivePath, request.backup.encryptionKey);
  assertRestorableBy(manifest, {
    version: dependencies.appVersion,
    migrations: dependencies.migrations,
  });
  assertDocumentsFit(manifest, request.documentStorage);
  await dependencies.checkRestore(request.adminUrl);
  return manifest;
}

export async function restoreArchive(
  request: RestoreRequest,
  dependencies: RestoreDependencies = defaultRestoreDependencies(),
): Promise<RestoreResult> {
  const manifest = await checkPrerequisites(request, dependencies);
  const session = postgres(request.adminUrl, {
    max: 1,
    onnotice: () => undefined,
    connection: { application_name: 'quro-restore' },
  });
  try {
    const { replacing } = await guardTarget(session, request, manifest);
    const preRestore = replacing ? await preRestoreArchive(request, dependencies) : null;
    const staged = await stageArchive(request, manifest);
    try {
      await replaceData(session, request, staged, dependencies);
    } finally {
      await discardStaging(staged);
    }
    request.log('Comparing the restored data with the archive');
    const restoredDocuments = await verifyRestored(session, request, manifest);
    await leaveMaintenance(session);
    return {
      manifest,
      preRestoreArchive: preRestore,
      restoredDocuments,
      pendingMigrations: pendingMigrations(manifest, dependencies),
    };
  } finally {
    await session.end({ timeout: SESSION_CLOSE_SECONDS }).catch(() => undefined);
  }
}
