import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { RegistrationMode } from '@quro/shared';
import { createDb, db } from '../db/client';
import { getRuntimeDatabaseUrl } from '../db/config';
import { users } from '../db/schema';
import { issueRegistrationCode } from './authCodes';
import { getRegistrationPolicy, registerAccount } from './registration';

// The shared test database always holds accounts, so the empty-instance races run against
// copies of `users` and `auth_codes` in a throwaway schema, over several real connections.
const schemaName = `registration_race_${crypto.randomUUID().replaceAll('-', '')}`;
const canCreateSchema = Boolean(
  (
    await db.execute(
      sql`select has_database_privilege(current_user, current_database(), 'CREATE') as allowed`,
    )
  )[0]?.allowed,
);

let isolated: ReturnType<typeof createDb>;

function account(label: string) {
  return {
    firstName: 'Race',
    lastName: label,
    email: `${label}-${crypto.randomUUID()}@registration-race.quro.test`,
    passwordHash: 'not-a-real-hash',
  };
}

function attempt(mode: RegistrationMode, label: string, code: string | null) {
  return registerAccount({ mode, code, user: account(label) }, isolated.db);
}

async function accountCount() {
  const [row] = await isolated.db.select({ count: sql<number>`count(*)::int` }).from(users);
  return row.count;
}

describe.skipIf(!canCreateSchema)('registration on an empty instance', () => {
  beforeAll(async () => {
    await db.execute(sql.raw(`CREATE SCHEMA ${schemaName}`));
    await db.execute(
      sql.raw(`
        CREATE TABLE ${schemaName}.users (LIKE public.users INCLUDING ALL);
        CREATE TABLE ${schemaName}.auth_codes (LIKE public.auth_codes INCLUDING ALL);
      `),
    );
    isolated = createDb(getRuntimeDatabaseUrl(), {
      max: 6,
      connection: { search_path: `${schemaName}, public` },
    });
  });

  beforeEach(async () => {
    await isolated.db.execute(sql.raw('TRUNCATE users, auth_codes'));
  });

  afterAll(async () => {
    await isolated?.queryClient.end({ timeout: 5 });
    await db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`));
  });

  test('reports setup until the first account exists', async () => {
    expect(await getRegistrationPolicy('open', isolated.db)).toEqual({
      signUp: 'code',
      setupRequired: true,
    });
  });

  test('concurrent sign-ups without a code cannot claim the instance in any mode', async () => {
    for (const mode of ['open', 'invite', 'closed'] as const) {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => attempt(mode, `${mode}-${i}`, null)),
      );
      expect(results.map((result) => [result.ok, !result.ok && result.reason])).toEqual(
        Array.from({ length: 5 }, () => [false, 'code_required']),
      );
    }
    expect(await accountCount()).toBe(0);
  });

  test('only the holder of an operator code becomes the first account under contention', async () => {
    const { code } = await issueRegistrationCode({}, isolated.db);
    const results = await Promise.all([
      attempt('open', 'holder', code),
      ...Array.from({ length: 5 }, (_, i) => attempt('open', `codeless-${i}`, null)),
    ]);

    const [holder, ...codeless] = results;
    expect(holder).toMatchObject({ ok: true, firstAccount: true });
    // Codeless requests that won the lock before the holder were refused; later ones joined
    // the now-open instance as ordinary accounts. None was treated as the first account.
    for (const result of codeless) {
      expect(result.ok ? result.firstAccount : result.reason).toBe(
        result.ok ? false : 'code_required',
      );
    }
    expect(results.filter((result) => result.ok && result.firstAccount)).toHaveLength(1);
  });

  test('one code creates exactly one account even when redeemed concurrently', async () => {
    const { code } = await issueRegistrationCode({}, isolated.db);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => attempt('invite', `same-code-${i}`, code)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === 'invalid_code')).toHaveLength(
      5,
    );
    expect(await accountCount()).toBe(1);
  });

  test('closed mode still accepts a setup code, then refuses even valid codes', async () => {
    const first = await issueRegistrationCode({}, isolated.db);
    expect(await attempt('closed', 'owner', first.code)).toMatchObject({
      ok: true,
      firstAccount: true,
    });

    const second = await issueRegistrationCode({}, isolated.db);
    expect(await attempt('closed', 'late', second.code)).toMatchObject({
      ok: false,
      reason: 'closed',
    });
    expect(await getRegistrationPolicy('closed', isolated.db)).toEqual({
      signUp: 'closed',
      setupRequired: false,
    });
    // The refused attempt rolled back, so the code was not spent.
    expect(await attempt('invite', 'later-invite', second.code)).toMatchObject({ ok: true });
  });
});
