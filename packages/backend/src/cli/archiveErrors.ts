import { ConfigError } from '../config';
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

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
]);
// Server shutting down or starting up.
const UNAVAILABLE_SQLSTATES = new Set(['57P01', '57P02', '57P03']);
// Wrong password or user, or a database that does not exist: the settings are wrong.
const SETTINGS_SQLSTATES = new Set(['28P01', '28000', '3D000']);

const MAX_CAUSE_DEPTH = 5;

function codesOf(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < MAX_CAUSE_DEPTH; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') codes.push(code);
    current = (current as { cause?: unknown }).cause;
  }
  return codes;
}

function databaseExitCode(error: unknown): number | null {
  const codes = codesOf(error);
  const unavailable = codes.some(
    (code) => NETWORK_CODES.has(code) || UNAVAILABLE_SQLSTATES.has(code) || code.startsWith('08'),
  );
  if (unavailable) return EXIT_UNAVAILABLE;
  return codes.some((code) => SETTINGS_SQLSTATES.has(code)) ? EXIT_USAGE : null;
}

const isOneOf = (error: unknown, kinds: readonly (abstract new (...args: never[]) => Error)[]) =>
  kinds.some((kind) => error instanceof kind);

export function archiveExitCode(error: unknown): number {
  if (isOneOf(error, USAGE_ERRORS)) return EXIT_USAGE;
  if (isOneOf(error, REFUSALS)) return EXIT_REFUSED;
  if (isOneOf(error, DAMAGED)) return EXIT_FAILURE;
  return databaseExitCode(error) ?? EXIT_FAILURE;
}

/** A one-line reason that names no secret. Database errors carry no connection string. */
export function archiveErrorMessage(error: unknown): string {
  if (error instanceof ConfigError) return error.message;
  if (error instanceof Error) {
    if (databaseExitCode(error) === EXIT_UNAVAILABLE) {
      return `The database cannot be reached (${codesOf(error)[0]}). Nothing was changed.`;
    }
    return error.message;
  }
  return String(error);
}
