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
