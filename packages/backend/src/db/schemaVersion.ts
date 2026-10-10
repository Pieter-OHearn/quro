import type { Sql, TransactionSql } from 'postgres';
import journal from './migrations/meta/_journal.json';

// The schema version an image expects is the migration journal it ships. A database records what
// it has applied in drizzle.__drizzle_migrations, one row per migration with the journal entry's
// `when` as `created_at`. Comparing the two tells whether the schema matches the image, is behind
// it (run `quro migrate`) or is ahead of it (a newer image migrated this database).
//
// The journal is imported, not read from disk, so the server bundle carries it.

export type BundledMigration = { tag: string; when: number };

export const BUNDLED_MIGRATIONS: readonly BundledMigration[] = Object.freeze(
  journal.entries.map(({ tag, when }) => Object.freeze({ tag, when })),
);

export const MIGRATIONS_SCHEMA = 'drizzle';
export const MIGRATIONS_TABLE = '__drizzle_migrations';

/** The newest migration this image ships. */
export function latestBundledMigration(): BundledMigration {
  const latest = BUNDLED_MIGRATIONS.at(-1);
  if (!latest) throw new Error('The image ships no migrations.');
  return latest;
}

export type SchemaComparison =
  /** No migration has been applied: a new database. */
  | { status: 'empty'; pending: readonly BundledMigration[] }
  /** Every migration this image ships is applied. */
  | { status: 'current'; latest: BundledMigration }
  /** Older than the image: `quro migrate` applies the pending migrations. */
  | { status: 'behind'; applied: BundledMigration; pending: readonly BundledMigration[] }
  /** Migrated by a newer image; this image must not run against it. */
  | { status: 'ahead' }
  /** The newest applied migration is not one this image ships (a different build). */
  | { status: 'unknown' };

/**
 * Compares the newest applied migration with the bundled journal, the way the migrator decides
 * what to apply: everything newer than the newest applied migration is pending.
 */
export function compareSchema(
  latestAppliedWhen: number | null,
  bundled: readonly BundledMigration[] = BUNDLED_MIGRATIONS,
): SchemaComparison {
  if (latestAppliedWhen === null) return { status: 'empty', pending: bundled };
  const newestBundled = bundled.at(-1);
  if (!newestBundled || latestAppliedWhen > newestBundled.when) return { status: 'ahead' };
  const applied = bundled.find((migration) => migration.when === latestAppliedWhen);
  if (!applied) return { status: 'unknown' };
  const pending = bundled.filter((migration) => migration.when > latestAppliedWhen);
  return pending.length === 0
    ? { status: 'current', latest: applied }
    : { status: 'behind', applied, pending };
}

/** Whether the server may run against this schema. */
export function isCompatible(comparison: SchemaComparison): boolean {
  return comparison.status === 'current';
}

/** One sentence for operators: what the state is and what to do. Names no data. */
export function describeSchema(comparison: SchemaComparison): string {
  switch (comparison.status) {
    case 'current':
      return `The database schema matches this image (${comparison.latest.tag}).`;
    case 'empty':
      return 'The database has no schema yet. Run `quro migrate`.';
    case 'behind':
      return `The database schema is ${comparison.pending.length} migration(s) behind this image. Run \`quro migrate\`.`;
    case 'ahead':
      return 'The database schema is newer than this image. Run the newer image, or restore the backup taken before the upgrade.';
    case 'unknown':
      return 'The database schema has a migration this image does not ship. Run the image that migrated it.';
  }
}

type MigrationRow = { createdAt: string | number | null };

const UNDEFINED_TABLE = '42P01';
const INVALID_SCHEMA_NAME = '3F000';

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * The `when` of the newest applied migration, or null when none is (including a database
 * without the migrations table). Other errors, such as a missing privilege, are thrown.
 */
export async function readLatestAppliedWhen(
  sql: Sql<Record<string, unknown>> | TransactionSql<Record<string, unknown>>,
): Promise<number | null> {
  try {
    const [row] = await sql<MigrationRow[]>`
      select max(created_at) as "createdAt" from drizzle.__drizzle_migrations
    `;
    return row?.createdAt == null ? null : Number(row.createdAt);
  } catch (error) {
    const code = errorCode(error);
    if (code === UNDEFINED_TABLE || code === INVALID_SCHEMA_NAME) return null;
    throw error;
  }
}
