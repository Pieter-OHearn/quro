import { DrizzleQueryError } from 'drizzle-orm';

function isDatabaseFailure(error: unknown): boolean {
  const visited = new Set<object>();
  let current = error;
  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);
    if (current instanceof DrizzleQueryError) return true;
    // The driver's own error carries a five-character SQLSTATE and a severity.
    if (
      'severity' in current &&
      'code' in current &&
      typeof current.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(current.code)
    ) {
      return true;
    }
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}

/**
 * The text a bank sync failure may show the signed-in user and store on the connection. Messages
 * from the bank and from our own checks are shown as they are; a failed database statement is
 * not, because its message repeats the SQL and the values it carried.
 */
export function describeSyncFailure(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || isDatabaseFailure(error)) return fallback;
  return error.message;
}
