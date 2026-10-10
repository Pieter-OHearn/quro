import { resolve } from 'node:path';
import { assertConfig } from '../config';
import {
  defaultRestoreDependencies,
  restoreArchive,
  type RestoreDependencies,
} from '../backup/restoreArchive';
import { getRuntimeRoleConfig } from '../db/runtimeRole';
import { archiveErrorMessage, archiveExitCode } from './archiveErrors';
import { withInterruption } from './backup';
import { EXIT_FAILURE, EXIT_OK, UsageError, type CommandIo } from './io';

export const RESTORE_USAGE = `Usage: quro restore <archive>

Restores an archive written by quro backup into the configured database and document store.
It reads the whole archive and checks every checksum first, and refuses (exit code 3, nothing
changed) unless:
  - QRO_RESTORE_CONFIRM=restore-db is set,
  - no other session is connected to the database (stop the backend and the worker),
  - the database is new and empty, or at the archive's migration and, when it holds data,
    QRO_RESTORE_ALLOW_NON_EMPTY=1 is set,
  - the archive is not from a newer release than this image.
Before it replaces anything it writes a pre-restore archive into QRO_BACKUP_DIR. The database is
restored in one transaction; afterwards every table and document is compared with the archive.

In Docker Compose: see docs/backup-and-restore.md.`;

async function restore(path: string, io: CommandIo, dependencies: RestoreDependencies) {
  const config = assertConfig('restore');
  const result = await withInterruption((signal) =>
    restoreArchive(
      {
        archivePath: resolve(process.cwd(), path),
        adminUrl: config.adminDatabase.url.reveal(),
        runtimeRole: getRuntimeRoleConfig(),
        documentStorage: config.documentStorage,
        backup: config.backup,
        confirm: config.maintenance.restoreConfirm,
        allowNonEmpty: config.maintenance.restoreAllowNonEmpty,
        log: (line) => io.out(line),
        signal,
      },
      dependencies,
    ),
  );
  if (result.preRestoreArchive) {
    io.out(`Pre-restore archive: ${result.preRestoreArchive.path}`);
  }
  const { documents, database } = result.manifest;
  io.out(
    `Restored and verified: ${Object.keys(database.fingerprint.tables).length} tables match the archive, ${result.restoredDocuments} document(s) match their checksums.`,
  );
  if (!documents.included) {
    io.out(
      `The archive does not contain documents (S3 storage). The database refers to ${documents.referenced.length} object(s): restore the bucket with your store tools.`,
    );
  }
  if (result.pendingMigrations > 0) {
    io.out(
      `This image has ${result.pendingMigrations} migration(s) newer than the archive: run the database migrations before starting the application (in Docker Compose: docker compose run --rm migrate).`,
    );
  }
  io.out(
    'Review pending statement imports before starting the import worker (see docs/backup-and-restore.md), then start the application and sign in.',
  );
  return EXIT_OK;
}

export async function runRestoreCommand(
  args: readonly string[],
  io: CommandIo,
  dependencies: RestoreDependencies = defaultRestoreDependencies(),
): Promise<number> {
  const [first, ...rest] = args;
  if (first === '--help' || first === 'help') {
    io.out(RESTORE_USAGE);
    return EXIT_OK;
  }
  if (first === undefined || first.startsWith('-') || rest.length > 0) {
    throw new UsageError('quro restore takes the path of one archive');
  }
  try {
    return await restore(first, io, dependencies);
  } catch (error) {
    if ((error as { name?: unknown } | null)?.name === 'AbortError') {
      io.err(
        'Interrupted. The database transaction was rolled back unless the restore had finished.',
      );
      return EXIT_FAILURE;
    }
    io.err(archiveErrorMessage(error));
    return archiveExitCode(error);
  }
}
