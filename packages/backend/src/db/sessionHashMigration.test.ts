import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';
import { hashSessionToken } from '../lib/sessions';

const MIGRATION = new URL('./migrations/0038_session_hashes_and_auth_codes.sql', import.meta.url);

type Tx = Pick<typeof db, 'execute'>;

class Rollback extends Error {}

function rootCause(error: unknown): { code?: unknown } {
  return ((error as { cause?: unknown }).cause ?? error) as { code?: unknown };
}

// Only the statements that touch `sessions`; the auth_codes table needs no data migration.
async function runSessionStatements(tx: Tx) {
  const migration = await Bun.file(MIGRATION).text();
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.includes('"sessions"')) await tx.execute(sql.raw(statement));
  }
}

// Sessions as release 0.7.0 stored them: the raw 64-character hex cookie value is the id.
const LEGACY_TOKENS = ['0123456789abcdef'.repeat(4), 'fedcba9876543210'.repeat(4)];

async function withLegacySessions(run: (tx: Tx) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      // A temp table shadows the real one on this connection only.
      await tx.execute(sql.raw('SET LOCAL search_path = pg_temp, public'));
      await tx.execute(
        sql.raw(`
          CREATE TEMP TABLE sessions (
            id text PRIMARY KEY, user_id integer NOT NULL, expires_at timestamp NOT NULL,
            created_at timestamp DEFAULT now() NOT NULL
          ) ON COMMIT DROP;
          INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES
            ('${LEGACY_TOKENS[0]}', 1, '2030-01-01', '2026-09-01 10:00'),
            ('${LEGACY_TOKENS[1]}', 2, '2030-01-01', '2026-09-02 11:00');
        `),
      );
      await run(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

test('existing sessions are stored as the digest the backend looks up, so nobody is signed out', async () => {
  await withLegacySessions(async (tx) => {
    await runSessionStatements(tx);
    const rows = await tx.execute(
      sql.raw(
        "SELECT id, user_id, to_char(last_used_at, 'YYYY-MM-DD HH24:MI') AS last_used FROM sessions ORDER BY user_id",
      ),
    );
    expect(rows.map((row) => [row.id, row.user_id, row.last_used])).toEqual([
      [hashSessionToken(LEGACY_TOKENS[0]), 1, '2026-09-01 10:00'],
      [hashSessionToken(LEGACY_TOKENS[1]), 2, '2026-09-02 11:00'],
    ]);
  });
});

test('after the migration a raw cookie token can no longer be stored as a session id', async () => {
  await withLegacySessions(async (tx) => {
    await runSessionStatements(tx);
    const error = await tx
      .execute(
        sql.raw(
          `INSERT INTO sessions (id, user_id, expires_at) VALUES ('${LEGACY_TOKENS[0].slice(0, 43)}', 3, '2030-01-01')`,
        ),
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    // check_violation
    expect(rootCause(error).code).toBe('23514');
  });
});
