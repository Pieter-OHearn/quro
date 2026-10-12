import type { TransactionSql } from 'postgres';

// A fingerprint of the database: for every table of the application and migration schemas its
// row count and an order-independent checksum of its rows, and the position of every sequence.
// It holds names, counts and checksums, never row data. `quro backup` records it in the manifest
// from the same snapshot as the dump; `quro restore` computes it again on the restored database,
// so accounts, ledgers, permissions and the migration history are compared row for row.

const SCHEMAS = ['public', 'drizzle'];

export type TableFingerprint = { rows: number; checksum: string };

export type DatabaseFingerprint = {
  tables: Record<string, TableFingerprint>;
  sequences: Record<string, string | null>;
};

// The text form of a row depends on these session settings; fix them so both ends agree.
const STABLE_TEXT_SETTINGS: [string, string][] = [
  ['TimeZone', 'UTC'],
  ['DateStyle', 'ISO, MDY'],
  ['IntervalStyle', 'postgres'],
  ['extra_float_digits', '1'],
  ['bytea_output', 'hex'],
];

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/**
 * Reads the fingerprint inside a transaction (the settings above are set for it only). Each row
 * contributes the first 64 bits of the MD5 of its text form to an exact sum.
 */
export async function readDatabaseFingerprint(tx: TransactionSql): Promise<DatabaseFingerprint> {
  for (const [name, value] of STABLE_TEXT_SETTINGS) {
    await tx`select set_config(${name}, ${value}, true)`;
  }
  const tables = await tx<{ schema: string; name: string }[]>`
    select schemaname as schema, tablename as name from pg_tables
    where schemaname = any(${SCHEMAS}) order by schemaname, tablename
  `;
  const fingerprint: DatabaseFingerprint = { tables: {}, sequences: {} };
  for (const table of tables) {
    const [row] = await tx.unsafe<{ rows: string; checksum: string }[]>(
      `select count(*)::text as rows,
         coalesce(sum(('x' || substr(md5(t::text), 1, 16))::bit(64)::bigint::numeric), 0)::text as checksum
       from ${quote(table.schema)}.${quote(table.name)} as t`,
    );
    fingerprint.tables[`${table.schema}.${table.name}`] = {
      rows: Number(row!.rows),
      checksum: row!.checksum,
    };
  }
  const sequences = await tx<{ name: string; position: string | null }[]>`
    select schemaname || '.' || sequencename as name, last_value::text as position
    from pg_sequences where schemaname = any(${SCHEMAS}) order by 1
  `;
  for (const sequence of sequences) fingerprint.sequences[sequence.name] = sequence.position;
  return fingerprint;
}

/** Names of the tables and sequences that differ; empty when the fingerprints match. */
export function compareFingerprints(
  expected: DatabaseFingerprint,
  actual: DatabaseFingerprint,
): string[] {
  const differences: string[] = [];
  const tableNames = new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)]);
  for (const name of [...tableNames].sort()) {
    const before = expected.tables[name];
    const after = actual.tables[name];
    if (!before || !after) differences.push(`table ${name} ${before ? 'is missing' : 'is extra'}`);
    else if (before.rows !== after.rows) {
      differences.push(`table ${name}: ${after.rows} rows instead of ${before.rows}`);
    } else if (before.checksum !== after.checksum) {
      differences.push(`table ${name}: same row count, different content`);
    }
  }
  const sequenceNames = new Set([
    ...Object.keys(expected.sequences),
    ...Object.keys(actual.sequences),
  ]);
  for (const name of [...sequenceNames].sort()) {
    if (expected.sequences[name] !== actual.sequences[name]) {
      differences.push(`sequence ${name} differs`);
    }
  }
  return differences;
}

/** The total number of rows, for summaries. */
export function totalRows(fingerprint: DatabaseFingerprint): number {
  return Object.values(fingerprint.tables).reduce((sum, table) => sum + table.rows, 0);
}
