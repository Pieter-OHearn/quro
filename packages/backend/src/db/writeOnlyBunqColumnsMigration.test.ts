import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL('./migrations/0042_drop_write_only_bunq_columns.sql', import.meta.url);

class Rollback extends Error {}

// Transactions as synced before the migration: the three write-only bunq columns hold values.
test('the migration drops the three write-only bunq columns and keeps every other value', async () => {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql.raw('SET LOCAL search_path = pg_temp, public'));
      await tx.execute(
        sql.raw(`
          CREATE TEMP TABLE budget_transactions (
            id integer PRIMARY KEY, description text NOT NULL, amount numeric(19,2) NOT NULL,
            merchant text NOT NULL, bunq_transaction_id text, source_provider text,
            bunq_mcc text, bunq_payment_type text, counterparty_iban text
          ) ON COMMIT DROP;
          INSERT INTO budget_transactions VALUES
            (1, 'Food', -10.50, 'Shop', '41', 'bunq', '5411', 'CARD', 'NL00SYNTHETIC0000000001'),
            (2, 'Manual', -3.00, 'Kiosk', NULL, NULL, NULL, NULL, NULL);
        `),
      );
      const migration = await Bun.file(MIGRATION).text();
      for (const statement of migration.split('--> statement-breakpoint')) {
        await tx.execute(sql.raw(statement));
      }
      const columns = await tx.execute(
        sql.raw(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = pg_my_temp_schema()::regnamespace::text AND table_name = 'budget_transactions' ORDER BY ordinal_position",
        ),
      );
      expect(columns.map((row) => row.column_name)).toEqual([
        'id',
        'description',
        'amount',
        'merchant',
        'bunq_transaction_id',
        'source_provider',
      ]);
      const rows = await tx.execute(
        sql.raw(
          'SELECT id, description, amount::text AS amount, merchant, bunq_transaction_id, source_provider FROM budget_transactions ORDER BY id',
        ),
      );
      expect(
        rows.map((row) => [row.id, row.amount, row.merchant, row.bunq_transaction_id]),
      ).toEqual([
        [1, '-10.50', 'Shop', '41'],
        [2, '-3.00', 'Kiosk', null],
      ]);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
});
