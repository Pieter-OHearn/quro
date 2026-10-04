import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL('./migrations/0034_partner_link_one_per_user.sql', import.meta.url);

async function runMigration(tx: Pick<typeof db, 'execute'>) {
  const migration = await Bun.file(MIGRATION).text();
  for (const statement of migration.split('--> statement-breakpoint')) {
    await tx.execute(sql.raw(statement));
  }
}

function rootCause(error: unknown): { code?: unknown; message?: unknown } {
  const cause = (error as { cause?: unknown }).cause;
  return (cause ?? error) as { code?: unknown; message?: unknown };
}

function errorText(error: unknown): string {
  return String(rootCause(error).message);
}

class Rollback extends Error {}

async function inRolledBackTransaction(run: (tx: Pick<typeof db, 'execute'>) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      // Temp tables shadow the real table on this connection only.
      await tx.execute(sql.raw('SET LOCAL search_path = pg_temp, public'));
      await tx.execute(
        sql.raw(`
          CREATE TEMP TABLE partner_links (
            id serial PRIMARY KEY,
            requester_id integer NOT NULL,
            addressee_id integer NOT NULL
          ) ON COMMIT DROP;
        `),
      );
      await run(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

test('migration preflight refuses existing duplicates and reports ids only', async () => {
  await inRolledBackTransaction(async (tx) => {
    await tx.execute(
      sql.raw(`INSERT INTO partner_links (requester_id, addressee_id) VALUES (1, 2), (3, 1)`),
    );
    await tx.execute(sql.raw('SAVEPOINT preflight'));
    let message = '';
    try {
      await runMigration(tx);
    } catch (error) {
      message = errorText(error);
    }
    expect(message).toContain('user 1 in 2 links (ids 1,2)');
    expect(message).toContain('Resolve these rows manually');
    await tx.execute(sql.raw('ROLLBACK TO SAVEPOINT preflight'));
  });
});

test('migration succeeds on clean data and then blocks a second link', async () => {
  await inRolledBackTransaction(async (tx) => {
    await tx.execute(
      sql.raw(`INSERT INTO partner_links (requester_id, addressee_id) VALUES (1, 2)`),
    );
    await runMigration(tx);
    await tx.execute(sql.raw('SAVEPOINT second'));
    let code = '';
    try {
      await tx.execute(
        sql.raw(`INSERT INTO partner_links (requester_id, addressee_id) VALUES (3, 1)`),
      );
    } catch (error) {
      code = String(rootCause(error).code);
    }
    expect(code).toBe('23505');
    await tx.execute(sql.raw('ROLLBACK TO SAVEPOINT second'));
  });
});
