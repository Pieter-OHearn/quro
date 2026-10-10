import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql, TransactionSql } from 'postgres';

// Which migrations this build bundles (the drizzle journal) and which a database has applied
// (`drizzle.__drizzle_migrations`). Drizzle records each applied migration with the journal entry's
// `when` as `created_at`, so the two are matched on that value.

const JOURNAL_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'migrations/meta/_journal.json',
);

export type BundledMigration = { index: number; tag: string; createdAt: number };

export type AppliedMigration = { createdAt: number; hash: string };

/** The last migration a database has applied, named by the journal of this build when it knows it. */
export type MigrationPoint = { tag: string | null; createdAt: number; hash: string };

type Journal = { entries: { idx: number; tag: string; when: number }[] };

/** The migrations bundled with this build, oldest first. */
export function bundledMigrations(path = JOURNAL_FILE): BundledMigration[] {
  const journal = JSON.parse(readFileSync(path, 'utf8')) as Journal;
  return journal.entries
    .map((entry) => ({ index: entry.idx, tag: entry.tag, createdAt: entry.when }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

type AppliedRow = { createdAt: string; hash: string };

/**
 * The migrations the database has applied, oldest first, or null when it has no migration table
 * (a new, empty database).
 */
export async function readAppliedMigrations(
  sql: Sql | TransactionSql,
): Promise<AppliedMigration[] | null> {
  const [table] = await sql<{ exists: boolean }[]>`
    select to_regclass('drizzle.__drizzle_migrations') is not null as "exists"
  `;
  if (!table?.exists) return null;
  const rows = await sql<AppliedRow[]>`
    select created_at::text as "createdAt", hash
    from drizzle.__drizzle_migrations
    order by created_at, id
  `;
  return rows.map((row) => ({ createdAt: Number(row.createdAt), hash: row.hash }));
}

/** The last applied migration, or null when none is applied. */
export function lastMigration(
  applied: readonly AppliedMigration[] | null,
  bundled: readonly BundledMigration[],
): MigrationPoint | null {
  const last = applied?.[applied.length - 1];
  if (!last) return null;
  const known = bundled.find((migration) => migration.createdAt === last.createdAt);
  return { tag: known?.tag ?? null, createdAt: last.createdAt, hash: last.hash };
}

export type SchemaState =
  | { kind: 'empty' }
  | { kind: 'current'; last: MigrationPoint }
  | { kind: 'behind'; last: MigrationPoint | null; pending: number }
  | { kind: 'ahead'; last: MigrationPoint };

/**
 * How a database's migrations compare with this build: `ahead` when it applied a migration this
 * build does not bundle (it was migrated by a newer release).
 */
export function compareSchema(
  applied: readonly AppliedMigration[] | null,
  bundled: readonly BundledMigration[],
): SchemaState {
  if (!applied || applied.length === 0) return { kind: 'empty' };
  const last = lastMigration(applied, bundled)!;
  const known = new Set(bundled.map((migration) => migration.createdAt));
  if (applied.some((migration) => !known.has(migration.createdAt))) return { kind: 'ahead', last };
  const pending = bundled.filter((migration) => migration.createdAt > last.createdAt).length;
  return pending === 0 ? { kind: 'current', last } : { kind: 'behind', last, pending };
}
