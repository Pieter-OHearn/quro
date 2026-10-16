import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL('./migrations/0043_csv_imports.sql', import.meta.url);

class Rollback extends Error {}

// The ledgers as they were before the migration, with rows entered by hand and synced from a bank.
// The migration only adds nullable columns and indexes, so every value must survive, the new
// columns must read NULL, and any number of rows without an import key must still coexist.
test('the migration keeps existing ledger rows and leaves their import columns empty', async () => {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql.raw('CREATE SCHEMA csv_imports_migration_test'));
      await tx.execute(sql.raw('SET LOCAL search_path = csv_imports_migration_test, public'));
      await tx.execute(
        sql.raw(`
          CREATE TABLE users (id integer PRIMARY KEY);
          CREATE TABLE savings_accounts (id integer PRIMARY KEY);
          CREATE TABLE savings_transactions (
            id integer PRIMARY KEY, account_id integer NOT NULL, type text NOT NULL,
            amount numeric(19,2) NOT NULL, date date NOT NULL, note text, bunq_transaction_id text
          );
          CREATE TABLE budget_transactions (
            id integer PRIMARY KEY, user_id integer NOT NULL, description text NOT NULL,
            amount numeric(19,2) NOT NULL, date date NOT NULL, merchant text NOT NULL,
            bunq_transaction_id text
          );
          INSERT INTO savings_transactions VALUES
            (1, 7, 'deposit', 100.10, '2026-01-02', 'Manual', NULL),
            (2, 7, 'withdrawal', 20.00, '2026-01-03', NULL, '41'),
            (3, 7, 'deposit', 100.10, '2026-01-02', 'Manual', NULL);
          INSERT INTO budget_transactions VALUES
            (1, 3, 'Food', 10.50, '2026-01-02', 'Shop', '41'),
            (2, 3, 'Food', 10.50, '2026-01-02', 'Shop', NULL);
        `),
      );
      const migration = await Bun.file(MIGRATION).text();
      for (const statement of migration.split('--> statement-breakpoint')) {
        await tx.execute(sql.raw(statement));
      }
      const savings = await tx.execute(
        sql.raw(
          'SELECT id, type, amount::text AS amount, note, bunq_transaction_id, import_id, import_source, external_id FROM savings_transactions ORDER BY id',
        ),
      );
      expect(
        savings.map((row) => [row.id, row.type, row.amount, row.note, row.bunq_transaction_id]),
      ).toEqual([
        [1, 'deposit', '100.10', 'Manual', null],
        [2, 'withdrawal', '20.00', null, '41'],
        [3, 'deposit', '100.10', 'Manual', null],
      ]);
      expect(
        savings.every(
          (row) => row.import_id === null && row.import_source === null && row.external_id === null,
        ),
      ).toBe(true);
      const budget = await tx.execute(
        sql.raw(
          'SELECT id, amount::text AS amount, import_id, import_source, external_id FROM budget_transactions ORDER BY id',
        ),
      );
      expect(budget.map((row) => [row.id, row.amount, row.import_id, row.external_id])).toEqual([
        [1, '10.50', null, null],
        [2, '10.50', null, null],
      ]);

      // The import key is unique per account and source, and only once a key is set.
      await tx.execute(
        sql.raw(
          "UPDATE savings_transactions SET import_source = 'bank', external_id = 'T1' WHERE id = 1",
        ),
      );
      const duplicate = async () => {
        await tx.execute(
          sql.raw(
            "UPDATE savings_transactions SET import_source = 'bank', external_id = 'T1' WHERE id = 3",
          ),
        );
      };
      await expect(duplicate()).rejects.toThrow();
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
});
