import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AUTH_ROUTE_PATH = join(import.meta.dir, 'auth.ts');

describe('signin handler hardening', () => {
  const authRoute = readFileSync(AUTH_ROUTE_PATH, 'utf8');

  test('verifies a password hash even when the email is unknown', () => {
    expect(authRoute).toContain('DUMMY_PASSWORD_HASH');
    expect(authRoute).toContain('user?.passwordHash ?? DUMMY_PASSWORD_HASH');
    expect(authRoute).not.toMatch(
      /if \(!user\) \{\s*return c\.json\(\{ error: 'Invalid email or password' \}/,
    );
  });

  test('selects only fields needed for password verification', () => {
    expect(authRoute).toContain('select({ id: users.id, passwordHash: users.passwordHash })');
    expect(authRoute).not.toContain('db.select().from(users).where(eq(users.email, email))');
  });
});
