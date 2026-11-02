import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL('./migrations/0047_holding_dividend_amount.sql', import.meta.url);
const NOTE = 'Synthetic quarterly payout';

type Tx = Pick<typeof db, 'execute' | 'transaction'>;

class Rollback extends Error {}

async function rowsOf(tx: Pick<typeof db, 'execute'>, query: string): Promise<unknown[]> {
  return [...(await tx.execute(sql.raw(query)))];
}

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

// The holding ledger as release 1.0.0-rc.6 left it, in a schema of its own that shadows the real
// table for this transaction. Every row is synthetic.
async function withReleaseCandidate6Ledger(rows: string, run: (tx: Tx) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql.raw('CREATE SCHEMA dividend_amount_migration_test'));
      await tx.execute(sql.raw('SET LOCAL search_path = dividend_amount_migration_test, public'));
      await tx.execute(
        sql.raw(`
          CREATE TABLE holding_transactions (
            id serial PRIMARY KEY, user_id integer NOT NULL, holding_id integer NOT NULL,
            type text NOT NULL, shares numeric(19, 6), price numeric(23, 6) NOT NULL,
            date date NOT NULL, note text
          );
          ${rows}
          SELECT setval('holding_transactions_id_seq', 100);
        `),
      );
      await run(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

// Buys and sells at six-decimal prices, dividends in whole cents (the largest storable among
// them), a row of a type the API never wrote, and nulls where the ledger allows them.
const CENT_DIVIDENDS = `
  INSERT INTO holding_transactions (id, user_id, holding_id, type, shares, price, date, note)
  VALUES
    (1, 1, 10, 'buy', 10.5, 40.123456, '2025-01-02', NULL),
    (2, 1, 10, 'dividend', NULL, 12.34, '2025-03-31', '${NOTE}'),
    (3, 1, 10, 'sell', 2.25, 45, '2025-06-30', NULL),
    (4, 2, 11, 'dividend', NULL, 0.01, '2025-06-30', NULL),
    (5, 2, 11, 'dividend', NULL, 99999999999999999.99, '2025-09-30', NULL),
    (6, 2, 11, 'transfer', 1, 5.5, '2025-10-01', NULL);`;

const LEDGER = `
  SELECT id, user_id, holding_id, type, shares::text, price::text, amount::text, date::text, note
  FROM holding_transactions ORDER BY id`;

const row = (
  id: number,
  values: { type: string; shares?: string | null; price?: string | null; amount?: string | null },
  rest: { user_id: number; holding_id: number; date: string; note?: string | null },
) => ({
  id,
  shares: null,
  price: null,
  amount: null,
  note: null,
  ...rest,
  ...values,
});

test('the migration moves each dividend amount to its own column and keeps every other value', async () => {
  await withReleaseCandidate6Ledger(CENT_DIVIDENDS, async (tx) => {
    await runMigration(tx);

    const first = { user_id: 1, holding_id: 10 };
    const second = { user_id: 2, holding_id: 11 };
    expect(await rowsOf(tx, LEDGER)).toEqual([
      row(
        1,
        { type: 'buy', shares: '10.500000', price: '40.123456' },
        { ...first, date: '2025-01-02' },
      ),
      row(2, { type: 'dividend', amount: '12.34' }, { ...first, date: '2025-03-31', note: NOTE }),
      row(
        3,
        { type: 'sell', shares: '2.250000', price: '45.000000' },
        { ...first, date: '2025-06-30' },
      ),
      row(4, { type: 'dividend', amount: '0.01' }, { ...second, date: '2025-06-30' }),
      row(
        5,
        { type: 'dividend', amount: '99999999999999999.99' },
        { ...second, date: '2025-09-30' },
      ),
      row(
        6,
        { type: 'transfer', shares: '1.000000', price: '5.500000' },
        { ...second, date: '2025-10-01' },
      ),
    ]);

    // From now on a dividend has an amount and no price, and anything else a price and no amount.
    const refused = (values: string) =>
      tx
        .transaction((inner) =>
          inner.execute(
            sql.raw(`INSERT INTO holding_transactions (user_id, holding_id, type, shares, price,
              amount, date) VALUES ${values}`),
          ),
        )
        .then(
          () => null,
          (error: unknown) => rootCause(error).code,
        );
    expect(await refused(`(1, 10, 'dividend', NULL, 1.5, NULL, '2026-01-01')`)).toBe('23514');
    expect(await refused(`(1, 10, 'dividend', NULL, 1.5, 1.5, '2026-01-01')`)).toBe('23514');
    expect(await refused(`(1, 10, 'buy', 1, NULL, NULL, '2026-01-01')`)).toBe('23514');
    expect(await refused(`(1, 10, 'buy', 1, 1.5, 1.5, '2026-01-01')`)).toBe('23514');
    expect(await refused(`(1, 10, 'dividend', NULL, NULL, 1.5, '2026-01-01')`)).toBeNull();
  });
});

test('a dividend that is not whole cents refuses the migration, names ids only and changes nothing', async () => {
  const rows = `${CENT_DIVIDENDS}
    INSERT INTO holding_transactions (id, user_id, holding_id, type, shares, price, date, note)
    VALUES
      (7, 1, 10, 'dividend', NULL, 7.654321, '2025-12-31', '${NOTE}'),
      (8, 2, 11, 'dividend', NULL, 3.005, '2025-12-31', NULL);`;
  await withReleaseCandidate6Ledger(rows, async (tx) => {
    const before = await rowsOf(tx, 'SELECT * FROM holding_transactions ORDER BY id');
    const error = await tx
      .transaction((inner) => runMigration(inner))
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    const cause = rootCause(error);
    const message = String(cause.message);
    expect(cause.code).toBe('23514');
    expect(message).toContain('holding transactions 7, 8 are dividends of an amount');
    expect(message).toContain('Nothing was changed.');
    for (const sensitive of [NOTE, '7.654321', '3.005']) expect(message).not.toContain(sensitive);

    expect(await rowsOf(tx, 'SELECT * FROM holding_transactions ORDER BY id')).toEqual(before);
    expect(
      await rowsOf(
        tx,
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'dividend_amount_migration_test'
           AND table_name = 'holding_transactions' AND column_name = 'amount'`,
      ),
    ).toHaveLength(0);
  });
});
