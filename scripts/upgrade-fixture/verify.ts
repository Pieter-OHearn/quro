// Checks for the upgrade test of the 0.7.0 fixture (docs/upgrade-fixture.md); upgrade.sh runs it.
//
//   load-store  Puts the fixture's documents into an S3 store, after checking them against
//               documents.sha256.
//   compare     Compares the fixture database before the upgrade (PostgreSQL 16, 0.7.0 schema)
//               with the upgraded one, table by table, as declared in expectations.ts, and checks
//               that every document the upgraded rows refer to is in the store, unchanged.
//               The database URLs come from BEFORE_DATABASE_URL and AFTER_DATABASE_URL, so their
//               passwords stay out of the process list.
//
// Exit status 1 with one line per difference when a check fails. Output names tables, columns,
// row ids and keys, never row contents.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { sha256Hex } from './documents';
import {
  ATTACHMENTS,
  CHANGES_SINCE_FIXTURE,
  PROVENANCE_COLUMNS,
  type AttachmentColumns,
  type TableChange,
} from './expectations';

const REPO = join(import.meta.dir, '..', '..');
const JOURNAL = join(REPO, 'packages/backend/src/db/migrations/meta/_journal.json');
const SCHEMAS = ['public', 'drizzle'];
// Bun.argv starts with the runtime and the script.
const FIRST_ARGUMENT = 2;

export type Column = { name: string; numeric: boolean };
/** Table name (`schema.table`) to its columns, in column order. */
export type Schema = Map<string, Column[]>;

export type TablePlan = {
  table: string;
  /** The upgraded table's columns; both sides are projected onto them. */
  columns: Column[];
  /** One select expression per column for the 0.7.0 side, aliased to the column name. */
  beforeSelect: string[];
  change: TableChange;
};

export type Plan = { tables: TablePlan[]; newTables: Array<{ table: string; rows: number }> };

export const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`;
export const quoteTable = (table: string): string => table.split('.').map(quoteIdent).join('.');

function planColumns(
  table: string,
  before: Column[],
  after: Column[],
  change: TableChange,
  problems: string[],
) {
  const beforeNames = new Set(before.map((column) => column.name));
  const afterNames = new Set(after.map((column) => column.name));
  const added = change.addedColumns ?? {};
  const rewritten = change.rewrittenColumns ?? {};
  for (const column of before) {
    if (!afterNames.has(column.name))
      problems.push(`${table}.${column.name} existed in 0.7.0 and is gone`);
  }
  for (const name of Object.keys(added)) {
    if (beforeNames.has(name))
      problems.push(`${table}.${name} is declared as added but existed in 0.7.0`);
    if (!afterNames.has(name))
      problems.push(`${table}.${name} is declared as added but does not exist`);
  }
  for (const name of Object.keys(rewritten)) {
    if (!beforeNames.has(name) || !afterNames.has(name)) {
      problems.push(`${table}.${name} is declared as rewritten but is not in both versions`);
    }
  }
  const beforeSelect = after.map((column) => {
    const expression = added[column.name] ?? rewritten[column.name];
    if (expression !== undefined) return `${expression} as ${quoteIdent(column.name)}`;
    if (!beforeNames.has(column.name)) {
      problems.push(
        `${table}.${column.name} was added by a migration and is not declared in expectations.ts`,
      );
      return `null as ${quoteIdent(column.name)}`;
    }
    return quoteIdent(column.name);
  });
  return beforeSelect;
}

function tableProblems(
  before: Schema,
  after: Schema,
  changes: Record<string, TableChange>,
): string[] {
  const problems: string[] = [];
  for (const table of [...before.keys()].sort()) {
    if (!after.has(table)) problems.push(`${table} existed in 0.7.0 and is gone`);
  }
  for (const [table, change] of Object.entries(changes)) {
    if (!after.has(table))
      problems.push(`expectations.ts names ${table}, which does not exist after the upgrade`);
    if (change.newTable && before.has(table))
      problems.push(`${table} is declared as new but existed in 0.7.0`);
  }
  return problems;
}

/** Pairs the tables of both versions with their declared changes; problems are fatal. */
export function planComparison(
  before: Schema,
  after: Schema,
  changes: Record<string, TableChange>,
): { plan: Plan; problems: string[] } {
  const problems = tableProblems(before, after, changes);
  const plan: Plan = { tables: [], newTables: [] };
  for (const table of [...after.keys()].sort()) {
    const change = changes[table] ?? {};
    const afterColumns = after.get(table)!;
    const beforeColumns = before.get(table);
    if (!beforeColumns) {
      if (change.newTable) plan.newTables.push({ table, rows: change.newTable.rows });
      else
        problems.push(`${table} was added by a migration and is not declared in expectations.ts`);
      continue;
    }
    const beforeSelect = planColumns(table, beforeColumns, afterColumns, change, problems);
    plan.tables.push({ table, columns: afterColumns, beforeSelect, change });
  }
  return { plan, problems };
}

/** Row count, a checksum over the sorted text form of the rows and null counts per column. */
export function summaryQuery(
  table: string,
  select: string[],
  columns: Column[],
  where?: string,
): string {
  const nulls = columns.map(
    (column) => `count(*) filter (where r.${quoteIdent(column.name)} is null)`,
  );
  return [
    `select count(*)::text as rows,`,
    `  md5(coalesce(string_agg(r::text, E'\\n' order by r::text collate "C"), '')) as checksum,`,
    `  concat_ws(',', ${nulls.join(', ')}) as nulls`,
    `from (select ${select.join(', ')} from ${quoteTable(table)}${where ? ` where ${where}` : ''}) r`,
  ].join('\n');
}

/** Sum of every numeric column, per currency when the table has a `currency` column. */
export function totalsQuery(
  table: string,
  select: string[],
  columns: Column[],
  where?: string,
): string | null {
  const numeric = columns.filter((column) => column.numeric);
  if (numeric.length === 0) return null;
  const group = columns.some((column) => column.name === 'currency') ? 'r.currency::text' : `'all'`;
  const sums = numeric.map((column) => `coalesce(sum(r.${quoteIdent(column.name)})::text, 'null')`);
  return [
    `select ${group} as grp, concat_ws('|', ${sums.join(', ')}) as sums`,
    `from (select ${select.join(', ')} from ${quoteTable(table)}${where ? ` where ${where}` : ''}) r`,
    `group by 1 order by 1`,
  ].join('\n');
}

type Sql = InstanceType<typeof Bun.SQL>;
type Row = Record<string, string | null>;

async function readSchema(sql: Sql): Promise<Schema> {
  const rows = await sql<Array<{ table_name: string; column_name: string; numeric: boolean }>>`
    select n.nspname || '.' || c.relname as table_name, a.attname as column_name,
      a.atttypid = 'numeric'::regtype as numeric
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where c.relkind in ('r', 'p') and n.nspname in ${sql(SCHEMAS)}
    order by 1, a.attnum`;
  const schema: Schema = new Map();
  for (const row of rows) {
    const columns = schema.get(row.table_name) ?? [];
    columns.push({ name: row.column_name, numeric: row.numeric });
    schema.set(row.table_name, columns);
  }
  return schema;
}

async function sequences(sql: Sql): Promise<Map<string, string>> {
  const rows = await sql<Array<{ name: string; value: string }>>`
    select schemaname || '.' || sequencename as name, coalesce(last_value::text, 'unused') as value
    from pg_sequences where schemaname in ${sql(SCHEMAS)}`;
  return new Map(rows.map((row) => [row.name, row.value]));
}

async function journalLength(): Promise<number> {
  const journal = JSON.parse(await readFile(JOURNAL, 'utf8')) as { entries: unknown[] };
  return journal.entries.length;
}

type Context = { before: Sql; after: Sql; failures: string[] };

async function first(sql: Sql, query: string): Promise<Row> {
  const rows = (await sql.unsafe(query)) as Row[];
  return rows[0] ?? {};
}

async function compareTable(
  context: Context,
  plan: TablePlan,
  migrationsBehind: number,
): Promise<number> {
  const { before, after, failures } = context;
  const { table, columns, beforeSelect, change } = plan;
  const afterSelect = columns.map((column) => quoteIdent(column.name));
  let afterWhere: string | undefined;
  let appendedFound = 0;
  if (change.appendedRows) {
    const key = quoteIdent(change.appendedRows.key);
    const max = await first(
      before,
      `select coalesce(max(${key}), 0)::text as max from ${quoteTable(table)}`,
    );
    afterWhere = `${key} <= ${Number(max.max)}`;
    const expected =
      change.appendedRows.count === 'journal' ? migrationsBehind : change.appendedRows.count;
    const added = await first(
      after,
      `select count(*)::text as n from ${quoteTable(table)} where not (${afterWhere})`,
    );
    appendedFound = Number(added.n);
    if (appendedFound !== expected)
      failures.push(`${table}: ${added.n} rows appended, expected ${expected}`);
  }
  const old = await first(before, summaryQuery(table, beforeSelect, columns, change.keptRows));
  const now = await first(after, summaryQuery(table, afterSelect, columns, afterWhere));
  if (old.rows !== now.rows)
    failures.push(`${table}: ${old.rows} rows expected, ${now.rows} found`);
  else if (old.checksum !== now.checksum) failures.push(`${table}: row contents differ (checksum)`);
  const oldNulls = (old.nulls ?? '').split(',');
  const newNulls = (now.nulls ?? '').split(',');
  columns.forEach((column, index) => {
    if (oldNulls[index] !== newNulls[index]) {
      failures.push(
        `${table}.${column.name}: ${oldNulls[index]} nulls expected, ${newNulls[index]} found`,
      );
    }
  });
  const totals = totalsQuery(table, beforeSelect, columns, change.keptRows);
  if (totals) {
    const oldTotals = (await before.unsafe(totals)) as Row[];
    const newTotals = (await after.unsafe(
      totalsQuery(table, afterSelect, columns, afterWhere)!,
    )) as Row[];
    compareTotals(table, columns, oldTotals, newTotals, failures);
  }
  return Number(now.rows) + appendedFound;
}

export function compareTotals(
  table: string,
  columns: Column[],
  old: Row[],
  now: Row[],
  failures: string[],
): void {
  const numeric = columns.filter((column) => column.numeric);
  const byGroup = new Map(now.map((row) => [row.grp, (row.sums ?? '').split('|')]));
  const groups = new Set([...old.map((row) => row.grp), ...now.map((row) => row.grp)]);
  for (const group of groups) {
    const expected = old.find((row) => row.grp === group)?.sums?.split('|');
    const found = byGroup.get(group);
    numeric.forEach((column, index) => {
      if (expected?.[index] !== found?.[index]) {
        failures.push(
          `${table}.${column.name}: total for ${group} is ${found?.[index] ?? 'missing'}, expected ${expected?.[index] ?? 'none'}`,
        );
      }
    });
  }
}

async function compareProvenance(context: Context, plans: Map<string, TablePlan>): Promise<number> {
  let checked = 0;
  for (const [table, names] of Object.entries(PROVENANCE_COLUMNS)) {
    const plan = plans.get(table);
    const missing = names.filter((name) => !plan?.columns.some((column) => column.name === name));
    if (!plan || missing.length > 0) {
      context.failures.push(
        `expectations.ts lists provenance ${table}.${missing.join(', ') || '*'}, which is not compared`,
      );
      continue;
    }
    const pick = (select: string[]) =>
      names.map((name) => select[plan.columns.findIndex((column) => column.name === name)]!);
    const query = (select: string[], where?: string) =>
      `select r.id::text as id, json_build_array(${names.map((name) => `r.${quoteIdent(name)}::text`).join(', ')})::text as v
       from (select id, ${pick(select).join(', ')} from ${quoteTable(table)}${where ? ` where ${where}` : ''}) r order by r.id`;
    const old = (await context.before.unsafe(
      query(plan.beforeSelect, plan.change.keptRows),
    )) as Row[];
    const now = new Map(
      (
        (await context.after.unsafe(
          query(plan.columns.map((column) => quoteIdent(column.name))),
        )) as Row[]
      ).map((row) => [row.id, JSON.parse(row.v ?? '[]') as unknown[]]),
    );
    for (const row of old) {
      const expected = JSON.parse(row.v ?? '[]') as unknown[];
      const found = now.get(row.id);
      if (!found) {
        context.failures.push(`${table}#${row.id}: row is gone`);
        continue;
      }
      const differing = names.filter((_, index) => expected[index] !== found[index]);
      if (differing.length > 0)
        context.failures.push(`${table}#${row.id}: ${differing.join(', ')} changed`);
      checked += 1;
    }
  }
  return checked;
}

async function compareSequences(context: Context, plan: Plan): Promise<void> {
  const old = await sequences(context.before);
  const now = await sequences(context.after);
  const growing = new Set<string>();
  for (const table of plan.tables) {
    if (!table.change.appendedRows) continue;
    const owned = await first(
      context.after,
      `select pg_get_serial_sequence('${quoteTable(table.table).replaceAll("'", "''")}', '${table.change.appendedRows.key}') as name`,
    );
    if (owned.name) growing.add(owned.name.replaceAll('"', ''));
  }
  for (const [name, value] of old) {
    const found = now.get(name);
    if (found === undefined) context.failures.push(`sequence ${name} is gone`);
    else if (growing.has(name) ? Number(found) < Number(value) : found !== value) {
      context.failures.push(
        `sequence ${name} is at ${found}, expected ${growing.has(name) ? 'at least ' : ''}${value}`,
      );
    }
  }
}

type Reference = { source: string; key: string; size: string; sha256: string | null };

async function references(sql: Sql, attachment: AttachmentColumns): Promise<Reference[]> {
  const sha = attachment.sha256 ? `${quoteIdent(attachment.sha256)}` : 'null';
  return (await sql.unsafe(
    `select '${attachment.table.split('.')[1]}#' || id as source, ${quoteIdent(attachment.key)} as key,
       ${quoteIdent(attachment.size)}::text as size, ${sha} as sha256
     from ${quoteTable(attachment.table)}
     where ${quoteIdent(attachment.key)} is not null${attachment.where ? ` and (${attachment.where})` : ''}
     order by id`,
  )) as Reference[];
}

function s3Client(endpoint: string, bucket: string) {
  // A test double: it accepts any credentials.
  return new Bun.S3Client({
    endpoint,
    bucket,
    region: 'us-east-1',
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
  });
}

async function listStore(client: ReturnType<typeof s3Client>): Promise<Map<string, number>> {
  const objects = new Map<string, number>();
  let continuationToken: string | undefined;
  do {
    const page = await client.list({ continuationToken });
    for (const object of page.contents ?? []) objects.set(object.key, object.size ?? Number.NaN);
    continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

export async function readManifest(fixture: string): Promise<Map<string, string>> {
  const text = await readFile(join(fixture, 'documents.sha256'), 'utf8');
  const manifest = new Map<string, string>();
  for (const line of text.split('\n').filter(Boolean)) {
    const match = /^(?<sha256>[0-9a-f]{64}) {2}(?<key>\S+)$/.exec(line);
    if (!match?.groups) throw new Error(`documents.sha256: unreadable line: ${line}`);
    manifest.set(match.groups.key!, match.groups.sha256!);
  }
  return manifest;
}

type StoreView = {
  client: ReturnType<typeof s3Client>;
  stored: Map<string, number>;
  manifest: Map<string, string>;
};

async function checkReference(
  reference: Reference,
  store: StoreView,
  failures: string[],
): Promise<void> {
  const where = `${reference.source} (${reference.key})`;
  const size = store.stored.get(reference.key);
  if (size === undefined) {
    failures.push(`${where}: not in the store`);
    return;
  }
  if (String(size) !== reference.size)
    failures.push(`${where}: ${size} bytes stored, ${reference.size} recorded`);
  const sha256 = sha256Hex(new Uint8Array(await store.client.file(reference.key).arrayBuffer()));
  if (reference.sha256 && reference.sha256 !== sha256)
    failures.push(`${where}: SHA-256 differs from the recorded one`);
  const expected = store.manifest.get(reference.key);
  if (expected && expected !== sha256) failures.push(`${where}: content differs from the fixture`);
}

async function compareAttachments(
  context: Context,
  client: ReturnType<typeof s3Client>,
  manifest: Map<string, string>,
): Promise<{ references: number; objects: number }> {
  const store: StoreView = { client, stored: await listStore(client), manifest };
  const afterKeys = new Set<string>();
  for (const attachment of ATTACHMENTS) {
    for (const reference of await references(context.after, attachment)) {
      afterKeys.add(`${reference.source} ${reference.key}`);
      await checkReference(reference, store, context.failures);
    }
  }
  for (const attachment of ATTACHMENTS) {
    for (const reference of await references(context.before, attachment)) {
      if (!afterKeys.has(`${reference.source} ${reference.key}`)) {
        context.failures.push(
          `${reference.source} (${reference.key}): no longer refers to its document`,
        );
      }
    }
  }
  return { references: afterKeys.size, objects: store.stored.size };
}

async function compare(options: {
  before: string;
  after: string;
  fixture: string;
  endpoint: string;
  bucket: string;
}) {
  const context: Context = {
    before: new Bun.SQL(options.before),
    after: new Bun.SQL(options.after),
    failures: [],
  };
  try {
    const { plan, problems } = planComparison(
      await readSchema(context.before),
      await readSchema(context.after),
      CHANGES_SINCE_FIXTURE,
    );
    context.failures.push(...problems);
    const fixtureMigrations = await first(
      context.before,
      'select count(*)::text as n from drizzle.__drizzle_migrations',
    );
    const migrationsBehind = (await journalLength()) - Number(fixtureMigrations.n);
    let rowsBefore = 0;
    let rowsAfter = 0;
    for (const table of plan.tables) {
      rowsBefore += Number(
        (await first(context.before, `select count(*)::text as n from ${quoteTable(table.table)}`))
          .n,
      );
      rowsAfter += await compareTable(context, table, migrationsBehind);
    }
    for (const table of plan.newTables) {
      const found = await first(
        context.after,
        `select count(*)::text as n from ${quoteTable(table.table)}`,
      );
      rowsAfter += Number(found.n);
      if (Number(found.n) !== table.rows)
        context.failures.push(`${table.table}: ${found.n} rows, expected ${table.rows}`);
    }
    await compareSequences(context, plan);
    const provenance = await compareProvenance(
      context,
      new Map(plan.tables.map((table) => [table.table, table])),
    );
    const store = await compareAttachments(
      context,
      s3Client(options.endpoint, options.bucket),
      await readManifest(options.fixture),
    );
    console.log(
      `tables: ${plan.tables.length} compared, ${plan.newTables.length} new (${plan.newTables.map((t) => t.table).join(', ') || 'none'})`,
    );
    console.log(
      `rows: ${rowsBefore} in the fixture, ${rowsAfter} after the upgrade (${migrationsBehind} migration(s) applied)`,
    );
    console.log(`provenance: ${provenance} rows compared column by column`);
    console.log(
      `documents: ${store.references} references, all checked against ${store.objects} stored objects`,
    );
  } finally {
    await Promise.all([context.before.close(), context.after.close()]);
  }
  if (context.failures.length > 0) {
    console.error(`\n${context.failures.length} difference(s):`);
    for (const failure of context.failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('upgrade verified: no undeclared change');
}

async function loadStore(options: { fixture: string; endpoint: string; bucket: string }) {
  const manifest = await readManifest(options.fixture);
  const directory = join(options.fixture, 'documents');
  const files = (await Array.fromAsync(new Bun.Glob('**/*').scan({ cwd: directory }))).sort();
  const unlisted = files.filter((file) => !manifest.has(file));
  if (unlisted.length > 0)
    throw new Error(`documents not in documents.sha256: ${unlisted.join(', ')}`);
  const client = s3Client(options.endpoint, options.bucket);
  for (const [key, sha256] of manifest) {
    const bytes = new Uint8Array(await Bun.file(join(directory, key)).arrayBuffer());
    if (sha256Hex(bytes) !== sha256) throw new Error(`${key} does not match documents.sha256`);
    await client.write(key, bytes, { type: 'application/pdf' });
  }
  console.log(`stored ${manifest.size} documents`);
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    args: Bun.argv.slice(FIRST_ARGUMENT),
    allowPositionals: true,
    options: {
      fixture: { type: 'string' },
      endpoint: { type: 'string' },
      bucket: { type: 'string' },
    },
  });
  const fromEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const need = (name: keyof typeof values): string => {
    const value = values[name];
    if (!value) throw new Error(`--${name} is required`);
    return value;
  };
  const store = { fixture: need('fixture'), endpoint: need('endpoint'), bucket: need('bucket') };
  if (positionals[0] === 'load-store') await loadStore(store);
  else if (positionals[0] === 'compare')
    await compare({
      ...store,
      before: fromEnv('BEFORE_DATABASE_URL'),
      after: fromEnv('AFTER_DATABASE_URL'),
    });
  else
    throw new Error(
      'usage: verify.ts load-store|compare --fixture DIR --endpoint URL --bucket NAME',
    );
}
