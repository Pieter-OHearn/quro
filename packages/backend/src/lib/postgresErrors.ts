export function hasPostgresErrorCode(error: unknown, expectedCode: string): boolean {
  const visited = new Set<object>();
  let current = error;

  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);
    if ('code' in current && current.code === expectedCode) return true;
    current = 'cause' in current ? current.cause : null;
  }

  return false;
}

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

export function isUniqueViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, PG_UNIQUE_VIOLATION);
}

export function isForeignKeyViolation(error: unknown): boolean {
  return hasPostgresErrorCode(error, PG_FOREIGN_KEY_VIOLATION);
}

// SQLSTATE class 22 means the database refused a value it was given: a number outside the
// column range, text with a NUL character, an impossible date. The request, not the server, is
// at fault.
const PG_DATA_EXCEPTION_CODE = /^22[0-9A-Z]{3}$/;

/** The SQLSTATE of the data exception in an error chain, or null. */
export function findDataExceptionCode(error: unknown): string | null {
  const visited = new Set<object>();
  let current = error;

  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);
    if ('code' in current && typeof current.code === 'string') {
      if (PG_DATA_EXCEPTION_CODE.test(current.code)) return current.code;
    }
    current = 'cause' in current ? current.cause : null;
  }

  return null;
}

export function isDataException(error: unknown): boolean {
  return findDataExceptionCode(error) !== null;
}
