import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

class Rollback extends Error {}

function rootCause(error: unknown): { code?: unknown } {
  return ((error as { cause?: unknown }).cause ?? error) as { code?: unknown };
}

// A session id is the SHA-256 digest of the cookie token (lib/sessions.ts), never the raw token,
// which is 43 base64url characters.
const RAW_COOKIE_VALUE = 'a'.repeat(43);

test('a raw cookie token cannot be stored as a session id', async () => {
  const error = await db
    .transaction(async (tx) => {
      await tx.execute(
        sql.raw(
          `INSERT INTO sessions (id, user_id, expires_at) VALUES ('${RAW_COOKIE_VALUE}', 3, '2030-01-01')`,
        ),
      );
      throw new Rollback();
    })
    .then(
      () => null,
      (caught: unknown) => caught,
    );
  // check_violation, raised before the user reference is checked
  expect(rootCause(error).code).toBe('23514');
});
