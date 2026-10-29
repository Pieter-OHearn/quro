import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from './client';

const MIGRATION = new URL(
  './migrations/0046_property_mortgage_ledger_ownership.sql',
  import.meta.url,
);
const ADDRESS = '1 Synthetic Lane';
const NOTE = 'Synthetic bank valuation';

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

// The tables this migration changes, as release 1.0.0-rc.5 left them (with the constraint and
// index it drops, so that nothing outside this schema matches their names), in a schema of their
// own that shadows the real ones for this transaction. Every row is synthetic.
async function withReleaseCandidate5Tables(rows: string, run: (tx: Tx) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await tx.execute(sql.raw('CREATE SCHEMA ledger_ownership_migration_test'));
      await tx.execute(sql.raw('SET LOCAL search_path = ledger_ownership_migration_test, public'));
      // A second run skips the dropped columns with a notice for each.
      await tx.execute(sql.raw('SET LOCAL client_min_messages = warning'));
      await tx.execute(
        sql.raw(`
          CREATE TABLE mortgages (
            id integer PRIMARY KEY, user_id integer NOT NULL,
            property_address text NOT NULL, property_value numeric(19, 2) NOT NULL
          );
          CREATE TABLE properties (
            id integer PRIMARY KEY, user_id integer NOT NULL,
            current_value numeric(19, 2) NOT NULL, mortgage numeric(19, 2) NOT NULL,
            mortgage_id integer REFERENCES mortgages (id) ON DELETE SET NULL
          );
          CREATE TABLE property_transactions (
            id serial PRIMARY KEY, user_id integer NOT NULL, property_id integer NOT NULL,
            type text NOT NULL, amount numeric(19, 2) NOT NULL, interest numeric(19, 2),
            principal numeric(19, 2), unapplied_principal numeric(19, 2) DEFAULT 0 NOT NULL,
            repayment_target text,
            repayment_mortgage_id integer
              CONSTRAINT property_transactions_repayment_mortgage_id_mortgages_id_fk
              REFERENCES mortgages (id) ON DELETE SET NULL,
            date date NOT NULL, note text,
            CONSTRAINT property_transactions_repayment_target_check CHECK (
              repayment_target IS NULL OR repayment_target = 'mortgage'
              OR (repayment_target = 'property' AND repayment_mortgage_id IS NULL)
            )
          );
          CREATE INDEX property_transactions_repayment_mortgage_id_idx
            ON property_transactions (repayment_mortgage_id);
          CREATE TABLE mortgage_transactions (
            id serial PRIMARY KEY, user_id integer NOT NULL, mortgage_id integer NOT NULL,
            type text NOT NULL, amount numeric(19, 2) NOT NULL, interest numeric(19, 2),
            principal numeric(19, 2), unapplied_principal numeric(19, 2) DEFAULT 0 NOT NULL,
            date date NOT NULL, note text, fixed_years numeric(4, 1)
          );
          ${rows}
          SELECT setval('property_transactions_id_seq', 100);
          SELECT setval('mortgage_transactions_id_seq', 100);
        `),
      );
      await run(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

// Mortgage 10 is linked to property 1, mortgage 11 to property 2; property 3 has no debt.
const SEPARABLE = `
  INSERT INTO mortgages VALUES
    (10, 1, '${ADDRESS}', 300000), (11, 1, '2 Synthetic Lane', 260000),
    (12, 1, '9 Synthetic Lane', 100000);
  INSERT INTO properties VALUES
    (1, 1, 300000, 0, 10), (2, 1, 250000, 0, 11), (3, 1, 100000, 0, NULL);
  INSERT INTO property_transactions
    (id, user_id, property_id, type, amount, interest, principal, unapplied_principal,
     repayment_target, repayment_mortgage_id, date, note)
  VALUES
    (1, 1, 1, 'valuation', 310000, NULL, NULL, 0, NULL, NULL, '2026-01-01', NULL),
    (2, 1, 1, 'repayment', 1500, 500, 1000, 0, 'mortgage', 10, '2026-02-01', 'February'),
    (3, 2, 1, 'repayment', 1500, 480, 1020, 20, 'mortgage', 10, '2026-03-01', NULL),
    (4, 1, 2, 'rent_income', 900, NULL, NULL, 0, NULL, NULL, '2026-03-28', NULL),
    (5, 1, 1, 'valuation', 305000, NULL, NULL, 0, NULL, NULL, '2026-01-01', NULL),
    (6, 1, 2, 'repayment', 800, NULL, NULL, 0, 'mortgage', 11, '2026-03-05', NULL),
    (10, 1, 3, 'valuation', 125000, NULL, NULL, 0, NULL, NULL, '2999-01-01', NULL);
  INSERT INTO mortgage_transactions
    (id, user_id, mortgage_id, type, amount, interest, principal, unapplied_principal, date,
     note, fixed_years)
  VALUES
    (1, 1, 10, 'repayment', 1500, 500, 1000, 0, '2026-01-01', NULL, NULL),
    (2, 1, 10, 'valuation', 320000, NULL, NULL, 0, '2026-04-01', '${NOTE}', NULL),
    (3, 1, 11, 'rate_change', 3.5, NULL, NULL, 0, '2025-06-01', NULL, 10),
    (4, 2, 11, 'valuation', 240000, NULL, NULL, 0, '2025-01-01', NULL, NULL);`;

const PROPERTY_ROWS = `SELECT id, current_value::text AS value FROM properties ORDER BY id`;
const PROPERTY_LEDGER = `
  SELECT user_id, property_id, type, amount::text, date::text, note
  FROM property_transactions ORDER BY property_id, date, id`;
const MORTGAGE_LEDGER = `
  SELECT user_id, mortgage_id, type, amount::text, interest::text, principal::text,
    unapplied_principal::text AS unapplied, date::text, note, fixed_years::text
  FROM mortgage_transactions ORDER BY mortgage_id, date, id`;
const DROPPED_COLUMNS = `
  SELECT table_name || '.' || column_name AS name FROM information_schema.columns
  WHERE table_schema = 'ledger_ownership_migration_test'
    AND (table_name, column_name) IN (
      ('mortgages', 'property_address'), ('mortgages', 'property_value'),
      ('properties', 'mortgage'), ('property_transactions', 'interest'),
      ('property_transactions', 'principal'), ('property_transactions', 'unapplied_principal'),
      ('property_transactions', 'repayment_target'),
      ('property_transactions', 'repayment_mortgage_id'))
  ORDER BY 1`;

test('the migration moves every row to the ledger that owns it and drops the shared columns', async () => {
  await withReleaseCandidate5Tables(SEPARABLE, async (tx) => {
    await runMigration(tx);

    expect(await rowsOf(tx, PROPERTY_ROWS)).toEqual([
      // The moved mortgage valuation of 1 April is the latest.
      { id: 1, value: '320000.00' },
      // Its only valuation, moved from the mortgage.
      { id: 2, value: '240000.00' },
      // Its only valuation is dated in the future, so the entered value stays until that date.
      { id: 3, value: '100000.00' },
    ]);
    expect(await rowsOf(tx, PROPERTY_LEDGER)).toEqual([
      {
        user_id: 1,
        property_id: 1,
        type: 'valuation',
        amount: '310000.00',
        date: '2026-01-01',
        note: null,
      },
      {
        user_id: 1,
        property_id: 1,
        type: 'valuation',
        amount: '305000.00',
        date: '2026-01-01',
        note: null,
      },
      {
        user_id: 1,
        property_id: 1,
        type: 'valuation',
        amount: '320000.00',
        date: '2026-04-01',
        note: NOTE,
      },
      {
        user_id: 2,
        property_id: 2,
        type: 'valuation',
        amount: '240000.00',
        date: '2025-01-01',
        note: null,
      },
      {
        user_id: 1,
        property_id: 2,
        type: 'rent_income',
        amount: '900.00',
        date: '2026-03-28',
        note: null,
      },
      {
        user_id: 1,
        property_id: 3,
        type: 'valuation',
        amount: '125000.00',
        date: '2999-01-01',
        note: null,
      },
    ]);
    const repayment = { type: 'repayment', fixed_years: null };
    expect(await rowsOf(tx, MORTGAGE_LEDGER)).toEqual([
      {
        ...repayment,
        user_id: 1,
        mortgage_id: 10,
        amount: '1500.00',
        interest: '500.00',
        principal: '1000.00',
        unapplied: '0.00',
        date: '2026-01-01',
        note: null,
      },
      {
        ...repayment,
        user_id: 1,
        mortgage_id: 10,
        amount: '1500.00',
        interest: '500.00',
        principal: '1000.00',
        unapplied: '0.00',
        date: '2026-02-01',
        note: 'February',
      },
      // The payer, the split, what the zero clamp absorbed and the missing note are preserved.
      {
        ...repayment,
        user_id: 2,
        mortgage_id: 10,
        amount: '1500.00',
        interest: '480.00',
        principal: '1020.00',
        unapplied: '20.00',
        date: '2026-03-01',
        note: null,
      },
      {
        user_id: 1,
        mortgage_id: 11,
        type: 'rate_change',
        amount: '3.50',
        interest: null,
        principal: null,
        unapplied: '0.00',
        date: '2025-06-01',
        note: null,
        fixed_years: '10.0',
      },
      // A repayment recorded without a split keeps its null interest and principal.
      {
        ...repayment,
        user_id: 1,
        mortgage_id: 11,
        amount: '800.00',
        interest: null,
        principal: null,
        unapplied: '0.00',
        date: '2026-03-05',
        note: null,
      },
    ]);
    expect(await rowsOf(tx, DROPPED_COLUMNS)).toEqual([]);

    // A second run changes nothing.
    const before = [
      await rowsOf(tx, PROPERTY_ROWS),
      await rowsOf(tx, PROPERTY_LEDGER),
      await rowsOf(tx, MORTGAGE_LEDGER),
    ];
    await runMigration(tx);
    expect([
      await rowsOf(tx, PROPERTY_ROWS),
      await rowsOf(tx, PROPERTY_LEDGER),
      await rowsOf(tx, MORTGAGE_LEDGER),
    ]).toEqual(before);
  });
});

const AMBIGUOUS = `${SEPARABLE}
  INSERT INTO properties VALUES (4, 1, 90000, 75000.55, NULL);
  INSERT INTO property_transactions
    (id, user_id, property_id, type, amount, interest, principal, unapplied_principal,
     repayment_target, repayment_mortgage_id, date, note)
  VALUES
    (7, 1, 3, 'repayment', 1234.56, 0, 1234.56, 0, 'property', NULL, '2026-02-01', '${NOTE}'),
    (8, 1, 1, 'repayment', 1500, 500, 1000, 0, NULL, NULL, '2026-02-01', NULL),
    (9, 1, 1, 'repayment', 1500, 500, 1000, 0, 'mortgage', NULL, '2026-02-01', NULL);
  INSERT INTO mortgage_transactions
    (id, user_id, mortgage_id, type, amount, interest, principal, unapplied_principal, date,
     note, fixed_years)
  VALUES (5, 1, 12, 'valuation', 98765.43, NULL, NULL, 0, '2026-01-01', '${NOTE}', NULL);`;

const ALL_ROWS = `
  SELECT 'properties' AS t, to_jsonb(r) AS row FROM properties r
  UNION ALL SELECT 'mortgages', to_jsonb(r) FROM mortgages r
  UNION ALL SELECT 'property_transactions', to_jsonb(r) FROM property_transactions r
  UNION ALL SELECT 'mortgage_transactions', to_jsonb(r) FROM mortgage_transactions r
  ORDER BY 1, 2`;

test('the migration refuses rows whose owner cannot be told, names ids only and changes nothing', async () => {
  await withReleaseCandidate5Tables(AMBIGUOUS, async (tx) => {
    const before = await rowsOf(tx, ALL_ROWS);
    const error = await tx
      .transaction((inner) => runMigration(inner))
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    const cause = rootCause(error);
    const message = String(cause.message);
    expect(cause.code).toBe('23514');
    // Kept on the property, recorded before the debt was stored, and recorded for a deleted
    // mortgage.
    expect(message).toContain('property repayments 7, 8, 9 paid a debt kept on the property');
    // Mortgage 12 is linked to no property.
    expect(message).toContain('mortgage valuations 5 belong to a mortgage that is not linked');
    expect(message).toContain('properties 4 carry a mortgage balance without a linked mortgage');
    expect(message).toContain('Nothing was changed. Run the migration again afterwards.');
    // Ids only: no address, note or amount.
    for (const sensitive of [ADDRESS, NOTE, '1234.56', '98765.43', '75000.55']) {
      expect(message).not.toContain(sensitive);
    }

    expect(await rowsOf(tx, ALL_ROWS)).toEqual(before);
    expect(await rowsOf(tx, DROPPED_COLUMNS)).toHaveLength(8);
  });
});
