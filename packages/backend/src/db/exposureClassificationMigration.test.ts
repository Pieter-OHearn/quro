import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL('./migrations/0045_exposure_classification.sql', import.meta.url);

const HOLDING_COLUMNS =
  'id, user_id, name, ticker, current_price::text AS current_price, currency::text AS currency, sector, item_type, manual_price::text AS manual_price, exclude_from_sync';

// The migration only adds: two nullable holding columns with their checks, and a settings table.
// It runs here in a scratch schema, inside a transaction that is rolled back, against holdings
// that already exist in the shape the previous release stored them in. Nothing about those rows
// may change, and none may gain a class: a holding stays unclassified until its owner sets one.
class Rollback extends Error {}

test('the migration adds the classification columns to existing holdings without touching them', async () => {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql.raw('CREATE SCHEMA exposure_migration_test'));
      await tx.execute(sql.raw('SET LOCAL search_path = exposure_migration_test, public'));
      // The holdings table as the previous release had it: no class, no risk class.
      await tx.execute(
        sql.raw(
          'CREATE TABLE exposure_migration_test.holdings (LIKE public.holdings INCLUDING DEFAULTS INCLUDING GENERATED)',
        ),
      );
      await tx.execute(
        sql.raw(
          'ALTER TABLE exposure_migration_test.holdings DROP COLUMN asset_class, DROP COLUMN risk_class_override',
        ),
      );
      const [owner] = await tx.execute(
        sql.raw(`
          INSERT INTO public.users (first_name, last_name, email, password_hash)
          VALUES ('Ada', 'Example', 'ada@exposure-migration.test', 'hash')
          RETURNING id
        `),
      );
      const userId = Number(owner!.id);
      await tx.execute(
        sql.raw(`
          INSERT INTO exposure_migration_test.holdings
            (user_id, name, ticker, current_price, currency, sector, item_type, manual_price, exclude_from_sync)
          VALUES
            (${userId}, 'Example Global ETF', 'EXGE', 112.4, 'EUR', 'Diversified', 'etf', NULL, true),
            (${userId}, 'Sample US Fund', 'SMTF', 187.2, 'USD', 'Technology', 'fund', 190.5, false),
            (${userId}, 'Old Position', 'OLDP', 0.000001, 'GBP', 'Unknown', NULL, NULL, false)
        `),
      );
      const before = await tx.execute(
        sql.raw(`SELECT ${HOLDING_COLUMNS} FROM exposure_migration_test.holdings ORDER BY id`),
      );

      const migration = await Bun.file(MIGRATION).text();
      for (const statement of migration.split('--> statement-breakpoint')) {
        await tx.execute(sql.raw(statement));
      }

      const after = await tx.execute(
        sql.raw(`SELECT ${HOLDING_COLUMNS} FROM exposure_migration_test.holdings ORDER BY id`),
      );
      expect(after).toEqual(before);
      expect(after).toHaveLength(3);
      const classes = await tx.execute(
        sql.raw(
          'SELECT asset_class, risk_class_override FROM exposure_migration_test.holdings ORDER BY id',
        ),
      );
      expect(classes.map((row) => [row.asset_class, row.risk_class_override])).toEqual([
        [null, null],
        [null, null],
        [null, null],
      ]);

      // The checks accept a class and a risk class and refuse anything else.
      await tx.execute(
        sql.raw(
          `UPDATE exposure_migration_test.holdings SET asset_class = 'bond_short_government', risk_class_override = 3 WHERE ticker = 'EXGE'`,
        ),
      );
      for (const [column, value] of [
        ['asset_class', "'bonds'"],
        ['risk_class_override', '0'],
        ['risk_class_override', '8'],
      ] as const) {
        await expect(
          tx.transaction((inner) =>
            inner.execute(
              sql.raw(`UPDATE exposure_migration_test.holdings SET ${column} = ${value}`),
            ),
          ),
        ).rejects.toThrow();
      }

      // One settings document per user, as an object, removed with the account.
      await tx.execute(
        sql.raw(
          `INSERT INTO exposure_settings (user_id, settings) VALUES (${userId}, '{"version":1}')`,
        ),
      );
      await expect(
        tx.transaction((inner) =>
          inner.execute(
            sql.raw(
              `INSERT INTO exposure_settings (user_id, settings) VALUES (${userId}, '{"version":1}')`,
            ),
          ),
        ),
      ).rejects.toThrow();
      await tx.execute(sql.raw('DELETE FROM exposure_settings'));
      await expect(
        tx.transaction((inner) =>
          inner.execute(
            sql.raw(`INSERT INTO exposure_settings (user_id, settings) VALUES (${userId}, '[]')`),
          ),
        ),
      ).rejects.toThrow();
      await tx.execute(
        sql.raw(
          `INSERT INTO exposure_settings (user_id, settings) VALUES (${userId}, '{"version":1}')`,
        ),
      );
      await tx.execute(sql.raw(`DELETE FROM public.users WHERE id = ${userId}`));
      const left = await tx.execute(sql.raw('SELECT count(*)::int AS n FROM exposure_settings'));
      expect(left[0]!.n).toBe(0);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
});
