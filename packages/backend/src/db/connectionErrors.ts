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

export function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  return String((error as { code: unknown }).code ?? '');
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

/** A short reason without values from the connection string. */
export function describeDatabaseError(error: unknown): string {
  const code = errorCode(error);
  const known = Object.hasOwn(REASONS, code) ? REASONS[code] : undefined;
  if (known) return known;
  if (classifyDatabaseError(error) === 'unreachable') return 'the server cannot be reached';
  // PostgreSQL's own messages name objects, not values; driver messages can echo URLs.
  return SQLSTATE.test(code) && error instanceof Error
    ? `${error.message} (SQLSTATE ${code})`
    : 'unexpected database error';
}
