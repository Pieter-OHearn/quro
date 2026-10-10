import { ConfigError } from '../config';
import { classifyDatabaseError, describeDatabaseError } from '../db/connectionErrors';
import { PgToolError } from '../db/pgTools';
import { BackupDirectoryError, SchemaNewerThanImageError } from '../backup/createBackup';
import { ArchiveDecryptionError } from '../backup/encryption';
import { ArchiveFormatError, ArchiveVersionError } from '../backup/manifest';
import { RestoreRefusedError } from '../backup/restoreArchive';
import { TarFormatError } from '../backup/tar';
import {
  ArchiveIntegrityError,
  ArchiveKeyMissingError,
  ArchiveNotFoundError,
} from '../backup/verifyArchive';
import { EXIT_FAILURE, EXIT_REFUSED, EXIT_UNAVAILABLE, EXIT_USAGE, UsageError } from './io';

// Exit codes of `quro backup` and `quro restore` (docs/install-contract.md): 2 for settings and
// usage, 3 for a guard, 4 when the database cannot be reached, 1 for anything else.

const USAGE_ERRORS = [
  UsageError,
  ConfigError,
  BackupDirectoryError,
  PgToolError,
  ArchiveNotFoundError,
  ArchiveKeyMissingError,
];
const REFUSALS = [RestoreRefusedError, ArchiveVersionError, SchemaNewerThanImageError];
const DAMAGED = [ArchiveDecryptionError, ArchiveFormatError, ArchiveIntegrityError, TarFormatError];

const MAX_CAUSE_DEPTH = 5;

/** The error and the errors it wraps (pgTools wraps connection errors with a cause). */
function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < MAX_CAUSE_DEPTH; depth += 1) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/** The first database error in the chain that the install contract gives its own exit code. */
function databaseError(
  error: unknown,
): { kind: 'unreachable' | 'rejected'; error: unknown } | null {
  for (const candidate of causeChain(error)) {
    const kind = classifyDatabaseError(candidate);
    if (kind !== 'other') return { kind, error: candidate };
  }
  return null;
}

const isOneOf = (error: unknown, kinds: readonly (abstract new (...args: never[]) => Error)[]) =>
  kinds.some((kind) => error instanceof kind);

export function archiveExitCode(error: unknown): number {
  if (isOneOf(error, USAGE_ERRORS)) return EXIT_USAGE;
  if (isOneOf(error, REFUSALS)) return EXIT_REFUSED;
  if (isOneOf(error, DAMAGED)) return EXIT_FAILURE;
  const database = databaseError(error);
  if (!database) return EXIT_FAILURE;
  return database.kind === 'unreachable' ? EXIT_UNAVAILABLE : EXIT_USAGE;
}

/** A one-line reason that names no secret. Database errors carry no connection string. */
export function archiveErrorMessage(error: unknown): string {
  if (error instanceof ConfigError) return error.message;
  const database = databaseError(error);
  if (database?.kind === 'unreachable') {
    return `The database cannot be reached: ${describeDatabaseError(database.error)}. Nothing was changed.`;
  }
  if (database)
    return `The database refused the connection: ${describeDatabaseError(database.error)}.`;
  return error instanceof Error ? error.message : String(error);
}
