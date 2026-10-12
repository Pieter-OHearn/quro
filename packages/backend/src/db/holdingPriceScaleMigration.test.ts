import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL('./migrations/0039_holding_price_six_decimals.sql', import.meta.url);

type Tx = Pick<typeof db, 'execute'>;

class Rollback extends Error {}

// Prices as release 0.8.0 stored them, at the edges of numeric(19,2): zero, one cent, an ordinary
// price, the largest storable value, and a null manual price.
const PRICES = ['0.00', '0.01', '123.45', '99999999999999999.99'];

async function withTwoDecimalPrices(run: (tx: Tx) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      // Temp tables shadow the real ones on this connection only.
      await tx.execute(sql.raw('SET LOCAL search_path = pg_temp, public'));
      await tx.execute(
        sql.raw(`
          CREATE TEMP TABLE holdings (
            id integer, current_price numeric(19, 2) NOT NULL, manual_price numeric(19, 2)
          ) ON COMMIT DROP;
          CREATE TEMP TABLE holding_transactions (id integer, price numeric(19, 2) NOT NULL)
            ON COMMIT DROP;
          CREATE TEMP TABLE holding_price_history (id integer, close_price numeric(19, 2) NOT NULL)
            ON COMMIT DROP;
          INSERT INTO holdings
            SELECT n, p::numeric, CASE WHEN n % 2 = 0 THEN p::numeric END
            FROM unnest(ARRAY['${PRICES.join("','")}']) WITH ORDINALITY AS v(p, n);
          INSERT INTO holding_transactions SELECT id, current_price FROM holdings;
          INSERT INTO holding_price_history SELECT id, current_price FROM holdings;
        `),
      );
      await run(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

async function runMigration(tx: Tx) {
  const migration = await Bun.file(MIGRATION).text();
  for (const statement of migration.split('--> statement-breakpoint')) {
    await tx.execute(sql.raw(statement));
  }
}

type PriceRow = { col: string; id: number; value: string | null };

const PRICE_ROWS = `
  SELECT 'current_price' AS col, id, current_price::text AS value FROM holdings
  UNION ALL SELECT 'manual_price', id, manual_price::text FROM holdings
  UNION ALL SELECT 'price', id, price::text FROM holding_transactions
  UNION ALL SELECT 'close_price', id, close_price::text FROM holding_price_history
  ORDER BY 1, 2`;

test('widening the price scale keeps every two-decimal price and null as it was', async () => {
  await withTwoDecimalPrices(async (tx) => {
    const before = await tx.execute<PriceRow>(sql.raw(PRICE_ROWS));
    await runMigration(tx);
    const after = await tx.execute<PriceRow>(sql.raw(PRICE_ROWS));

    expect(after).toHaveLength(PRICES.length * 4);
    // Same rows, same values: only the scale grew, so each value gains four trailing zeros.
    const widened: PriceRow[] = before.map((row) => ({
      ...row,
      value: row.value === null ? null : `${row.value}0000`,
    }));
    expect([...after]).toEqual(widened);
    const equal = await tx.execute(
      sql.raw(`SELECT bool_and(t.price = h.current_price) AS same FROM holding_transactions t
               JOIN holdings h USING (id)`),
    );
    expect(equal[0]!.same).toBe(true);
  });
});

test('after the migration a price keeps six decimals and rounds the seventh', async () => {
  await withTwoDecimalPrices(async (tx) => {
    await runMigration(tx);
    const rows = await tx.execute(
      sql.raw(`INSERT INTO holding_transactions VALUES (10, 123.4567), (11, 0.1234565)
               RETURNING price::text AS price`),
    );
    expect(rows.map((row) => row.price)).toEqual(['123.456700', '0.123457']);
  });
});
