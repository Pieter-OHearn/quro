// Sorts database errors into the install contract's exit codes: an unreachable server (4, retry
// later) and rejected settings such as a wrong password or a missing database (2, fix the
// settings). Anything else is a failed operation (1). Messages name hosts and roles, never
// passwords or connection strings.

export type DatabaseErrorKind = 'unreachable' | 'rejected' | 'other';

// Network-level failures from the driver or the operating system.
const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  // The server is starting up or shutting down.
  '57P01',
  '57P02',
  '57P03',
  // Too many connections.
  '53300',
]);

// The server answered and refused the credentials or the database name.
const REJECTED_CODES = new Set(['28P01', '28000', '3D000']);

const CONNECTION_EXCEPTION_CLASS = '08';

function ownCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  return String((error as { code: unknown }).code ?? '');
}

const MAX_CAUSE_DEPTH = 5;

/**
 * The driver's error. The ORM wraps a failed statement in an error whose message repeats the
 * query and its parameters and keeps the driver's error as `cause`; only the cause is described.
 */
export function databaseError(error: unknown): unknown {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (ownCode(current) !== '') return current;
    if (typeof current !== 'object' || current === null || !('cause' in current)) break;
    current = (current as { cause: unknown }).cause;
  }
  return error;
}

export function errorCode(error: unknown): string {
  return ownCode(databaseError(error));
}

export function classifyDatabaseError(error: unknown): DatabaseErrorKind {
  const code = errorCode(error);
  if (UNREACHABLE_CODES.has(code) || code.startsWith(CONNECTION_EXCEPTION_CLASS)) {
    return 'unreachable';
  }
  if (REJECTED_CODES.has(code)) return 'rejected';
  return 'other';
}

const REASONS: Readonly<Record<string, string>> = {
  '28P01': 'the server rejected the role or its password',
  '28000': 'the server rejected the role or its password',
  '3D000': 'the database does not exist',
  ENOTFOUND: 'the host name does not resolve',
  EAI_AGAIN: 'the host name does not resolve',
  ECONNREFUSED: 'the connection was refused',
  CONNECT_TIMEOUT: 'the connection timed out',
  ETIMEDOUT: 'the connection timed out',
  '57P03': 'the server is starting up',
};

const SQLSTATE = /^[0-9A-Z]{5}$/;
// Class 22 (data exception) messages can quote the value the database refused, which may be a
// stored amount or name; only the code is reported for them.
const DATA_EXCEPTION = /^22[0-9A-Z]{3}$/;

/** A short reason without values from the connection string. */
export function describeDatabaseError(error: unknown): string {
  const cause = databaseError(error);
  const code = ownCode(cause);
  const known = Object.hasOwn(REASONS, code) ? REASONS[code] : undefined;
  if (known) return known;
  if (classifyDatabaseError(cause) === 'unreachable') return 'the server cannot be reached';
  if (DATA_EXCEPTION.test(code)) return `the database refused a value (SQLSTATE ${code})`;
  // PostgreSQL's own messages name objects, not values; driver messages can echo URLs.
  return SQLSTATE.test(code) && cause instanceof Error
    ? `${cause.message} (SQLSTATE ${code})`
    : 'unexpected database error';
}
