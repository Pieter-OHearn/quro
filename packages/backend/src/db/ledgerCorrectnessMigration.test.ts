import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL('./migrations/0040_ledger_correctness.sql', import.meta.url);
const SYNTHETIC_HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const FILE_NAME = 'synthetic-annual-statement.pdf';

type Tx = Pick<typeof db, 'execute' | 'transaction'>;

class Rollback extends Error {}

function rootCause(error: unknown): { code?: unknown; message?: unknown } {
  const cause = (error as { cause?: unknown }).cause;
  return (cause ?? error) as { code?: unknown; message?: unknown };
}

async function runMigration(tx: Pick<typeof db, 'execute'>) {
  const migration = await Bun.file(MIGRATION).text();
  for (const statement of migration.split('--> statement-breakpoint')) {
    await tx.execute(sql.raw(statement));
  }
}

// The tables this migration changes, as release 0.8.0 left them, in a schema of their own that
// shadows the real ones for this transaction. Every row is synthetic.
async function withRelease080Tables(imports: string, run: (tx: Tx) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql.raw('CREATE SCHEMA ledger_migration_test'));
      await tx.execute(sql.raw('SET LOCAL search_path = ledger_migration_test, public'));
      await tx.execute(
        sql.raw(`
          CREATE TABLE debt_payments (
            id integer PRIMARY KEY, amount numeric(19, 2) NOT NULL,
            principal numeric(19, 2) NOT NULL, interest numeric(19, 2) NOT NULL
          );
          CREATE TABLE mortgage_transactions (
            id integer PRIMARY KEY, type text NOT NULL, amount numeric(19, 2) NOT NULL,
            interest numeric(19, 2), principal numeric(19, 2)
          );
          CREATE TABLE property_transactions (
            id integer PRIMARY KEY, property_id integer NOT NULL, type text NOT NULL,
            amount numeric(19, 2) NOT NULL, interest numeric(19, 2), principal numeric(19, 2)
          );
          CREATE TABLE pension_statement_imports (
            id integer PRIMARY KEY, user_id integer NOT NULL, pot_id integer NOT NULL,
            status pension_import_status NOT NULL, file_name text NOT NULL,
            file_hash_sha256 text NOT NULL
          );
          INSERT INTO debt_payments VALUES (1, 100.01, 100.01, 0), (2, 300, 250, 50);
          INSERT INTO mortgage_transactions VALUES
            (1, 'repayment', 1000, 400, 600), (2, 'rate_change', 3.5, NULL, NULL);
          INSERT INTO property_transactions VALUES
            (1, 1, 'repayment', 900, 300, 600), (2, 1, 'expense', 120, NULL, NULL);
          INSERT INTO pension_statement_imports VALUES ${imports};
        `),
      );
      await run(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

const ROWS = `
  SELECT 'debt_payments' AS t, to_jsonb(r) AS row FROM debt_payments r
  UNION ALL SELECT 'mortgage_transactions', to_jsonb(r) FROM mortgage_transactions r
  UNION ALL SELECT 'property_transactions', to_jsonb(r) FROM property_transactions r
  UNION ALL SELECT 'pension_statement_imports', to_jsonb(r) FROM pension_statement_imports r
  ORDER BY 1, 2`;

const row = (id: number, potId: number, status: string, hash: string) =>
  `(${id}, 3, ${potId}, '${status}', '${FILE_NAME}', '${hash}')`;

// Imports the constraint allows: one committed import per file and pot; the same file in review,
// cancelled, or committed to another pot; another file committed to the same pot.
const ALLOWED = [
  row(1, 7, 'committed', SYNTHETIC_HASH),
  row(2, 7, 'ready_for_review', SYNTHETIC_HASH),
  row(3, 7, 'cancelled', SYNTHETIC_HASH),
  row(4, 8, 'committed', SYNTHETIC_HASH),
  row(5, 7, 'committed', OTHER_HASH),
];

test('the migration refuses statements committed twice, names ids only and changes nothing', async () => {
  const imports = [
    ...ALLOWED,
    row(6, 7, 'committed', SYNTHETIC_HASH),
    row(7, 9, 'committed', OTHER_HASH),
    row(8, 9, 'committed', OTHER_HASH),
  ].join(', ');
  await withRelease080Tables(imports, async (tx) => {
    const before = await tx.execute(sql.raw(ROWS));
    const error = await tx
      .transaction((inner) => runMigration(inner))
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    const cause = rootCause(error);
    const message = String(cause.message);
    expect(cause.code).toBe('23514');
    expect(message).toContain('pot 7 of user 3: imports 1, 6; pot 9 of user 3: imports 7, 8');
    expect(message).toContain('keep one import');
    expect(message).toContain('Run the migration again');
    // Ids only: no file name, no file hash, no amounts.
    expect(message).not.toContain(FILE_NAME);
    expect(message).not.toContain(SYNTHETIC_HASH);
    expect(message).not.toContain(OTHER_HASH);

    // The failed migration added nothing and changed, defaulted or deleted no row.
    expect(await tx.execute(sql.raw(ROWS))).toEqual(before);
    const columns = await tx.execute(
      sql.raw(`SELECT count(*)::int AS added FROM information_schema.columns
               WHERE table_schema = 'ledger_migration_test' AND column_name = 'unapplied_principal'`),
    );
    expect(columns[0]!.added).toBe(0);
  });
});

test('without duplicates the migration keeps every row and enforces one commit per statement', async () => {
  await withRelease080Tables(ALLOWED.join(', '), async (tx) => {
    const before = await tx.execute<{ t: string; row: Record<string, unknown> }>(sql.raw(ROWS));
    await runMigration(tx);
    const after = await tx.execute<{ t: string; row: Record<string, unknown> }>(sql.raw(ROWS));

    // Same rows with the same values; the new columns start empty (nothing absorbed, debt not
    // recorded) so existing repayments are reversed exactly as before.
    const added: Record<string, Record<string, unknown>> = {
      debt_payments: { unapplied_principal: 0 },
      mortgage_transactions: { unapplied_principal: 0 },
      property_transactions: {
        unapplied_principal: 0,
        repayment_target: null,
        repayment_mortgage_id: null,
      },
      pension_statement_imports: {},
    };
    expect([...after]).toEqual(
      before.map((entry) => ({ ...entry, row: { ...entry.row, ...added[entry.t] } })),
    );

    const secondCommit = await tx
      .transaction((inner) =>
        inner.execute(
          sql.raw(`UPDATE pension_statement_imports SET status = 'committed' WHERE id = 2`),
        ),
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(rootCause(secondCommit).code).toBe('23505');
    await tx.execute(
      sql.raw(
        `INSERT INTO pension_statement_imports VALUES ${row(9, 7, 'ready_for_review', SYNTHETIC_HASH)}`,
      ),
    );
  });
});
