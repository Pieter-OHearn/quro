import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL('./migrations/0034_partner_link_members.sql', import.meta.url);
// The first statements create the table and foreign keys; the test shadows the tables instead.
const SCHEMA_STATEMENT_COUNT = 3;

type Tx = Pick<typeof db, 'execute'>;

class Rollback extends Error {}

function rootCause(error: unknown): { code?: unknown; message?: unknown } {
  const cause = (error as { cause?: unknown }).cause;
  return (cause ?? error) as { code?: unknown; message?: unknown };
}

async function runDataStatements(tx: Tx) {
  const migration = await Bun.file(MIGRATION).text();
  for (const statement of migration
    .split('--> statement-breakpoint')
    .slice(SCHEMA_STATEMENT_COUNT)) {
    await tx.execute(sql.raw(statement));
  }
}

async function withTempTables(links: string, run: (tx: Tx) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      // Temp tables shadow the real ones on this connection only.
      await tx.execute(sql.raw('SET LOCAL search_path = pg_temp, public'));
      await tx.execute(
        sql.raw(`
          CREATE TEMP TABLE partner_links (
            id serial PRIMARY KEY, requester_id integer NOT NULL, addressee_id integer NOT NULL
          ) ON COMMIT DROP;
          CREATE TEMP TABLE partner_link_members (
            user_id integer PRIMARY KEY, link_id integer NOT NULL
          ) ON COMMIT DROP;
          INSERT INTO partner_links (requester_id, addressee_id) VALUES ${links};
        `),
      );
      await run(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

test('migration refuses existing duplicates and reports ids only', async () => {
  await withTempTables('(1, 2), (3, 1)', async (tx) => {
    const error = await runDataStatements(tx).then(
      () => null,
      (caught: unknown) => caught,
    );
    const message = String(rootCause(error).message);
    expect(message).toContain('user 1 in 2 links (ids 1,2)');
    expect(message).toContain('Resolve these rows manually');
  });
});

test('migration backfills both participants of each existing link', async () => {
  await withTempTables('(1, 2), (3, 4)', async (tx) => {
    await runDataStatements(tx);
    const rows = await tx.execute(
      sql.raw('SELECT user_id, link_id FROM partner_link_members ORDER BY user_id'),
    );
    expect(rows.map((row) => [row.user_id, row.link_id])).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
    ]);
  });
});
