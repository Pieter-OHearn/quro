import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

test('currency migration preserves ambiguous legacy values, flags review, and defaults new writes to EUR', async () => {
  const migration = await Bun.file(
    new URL('./migrations/0031_budget_currency_provenance.sql', import.meta.url),
  ).text();
  await db.transaction(async (tx) => {
    // Temporary tables shadow production tables only on this transaction's connection.
    await tx.execute(
      sql.raw(`
      CREATE TEMP TABLE budget_categories (id integer, budgeted numeric(19,2), spent numeric(19,2)) ON COMMIT DROP;
      CREATE TEMP TABLE budget_transactions (id integer, amount numeric(19,2), bunq_transaction_id text) ON COMMIT DROP;
      INSERT INTO budget_categories VALUES (1, 1000, 1000);
      INSERT INTO budget_transactions VALUES (1, 1000, NULL), (2, 1000, 'bunq-foreign');
    `),
    );
    for (const statement of migration.split('--> statement-breakpoint')) {
      await tx.execute(sql.raw(statement));
    }
    const categories = await tx.execute(sql.raw('SELECT * FROM budget_categories'));
    expect(categories[0]).toMatchObject({
      currency: 'EUR',
      budgeted: '1000.00',
      spent: '1000.00',
      currency_needs_review: true,
    });
    const transactions = await tx.execute(sql.raw('SELECT * FROM budget_transactions ORDER BY id'));
    expect(transactions).toHaveLength(2);
    for (const row of transactions) {
      expect(row).toMatchObject({
        currency: 'EUR',
        amount: '1000.00',
        source_amount: '1000.00',
        source_currency: null,
        currency_needs_review: true,
      });
    }
    const inserted = await tx.execute(
      sql.raw('INSERT INTO budget_categories (id, budgeted, spent) VALUES (2, 500, 0) RETURNING *'),
    );
    expect(inserted[0]).toMatchObject({ currency: 'EUR', currency_needs_review: false });
  });
});
