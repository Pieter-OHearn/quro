import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Sql } from 'postgres';

export const DEMO_USER_EMAIL = 'demo@quro.local';

export const CLEAR_TABLE_NAMES = [
  'pension_statement_import_rows',
  'pension_statement_imports',
  'budget_transactions',
  'budget_categories',
  'dashboard_transactions',
  'savings_transactions',
  'savings_accounts',
  'holding_transactions',
  'holding_price_history',
  'holdings',
  'property_transactions',
  'properties',
  'pension_transactions',
  'pension_pots',
  'mortgage_transactions',
  'mortgages',
  'debt_payments',
  'debts',
  'payslips',
  'goals',
  'currency_rates',
  'sessions',
  'worker_heartbeats',
  'users',
] as const;

export type CountPlanEntry = {
  scope: 'all' | 'demo-user';
  tableName: string;
};

export type TableCounts = Record<string, number>;

export type DatabaseSummary = {
  demoUserId: number | null;
  nonDemoUsers: number;
  tableCounts: TableCounts;
  totalUsers: number;
};

export const clearCountPlan: CountPlanEntry[] = CLEAR_TABLE_NAMES.map((tableName) => ({
  tableName,
  scope: 'all' as const,
}));

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const VALID_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TIMESTAMP_COMPONENT_LENGTH = 2;

export const backupDirectory = resolve(repoRoot, 'backups', 'db');

type CountRow = {
  count: number;
};

type DemoUserRow = {
  id: number;
};

export function assertConfirmation(
  envVarName: string,
  expectedValue: string,
  operationDescription: string,
) {
  if (process.env[envVarName] === expectedValue) {
    return;
  }

  throw new Error(
    `Refusing to ${operationDescription}. Set ${envVarName}=${expectedValue} after verifying the target database and backup state.`,
  );
}

export async function ensureDirectory(directoryPath: string) {
  await mkdir(directoryPath, { recursive: true });
}

export async function fileExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function getRepoRoot() {
  return repoRoot;
}

export function getTimestamp() {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(TIMESTAMP_COMPONENT_LENGTH, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function parseConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  return {
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    host: url.hostname || '127.0.0.1',
    password: decodeURIComponent(url.password),
    port: url.port || '5432',
    sslmode: url.searchParams.get('sslmode') ?? undefined,
    user: decodeURIComponent(url.username),
  };
}

export function quoteIdentifier(identifier: string) {
  if (!VALID_IDENTIFIER_REGEX.test(identifier)) {
    throw new Error(`Unsupported identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

export async function resolvePathFromCwdOrRepo(inputPath: string) {
  const cwdCandidate = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
  if (await fileExists(cwdCandidate)) {
    return cwdCandidate;
  }

  const repoCandidate = isAbsolute(inputPath) ? inputPath : resolve(repoRoot, inputPath);
  if (await fileExists(repoCandidate)) {
    return repoCandidate;
  }

  return cwdCandidate;
}

export function sumTableCounts(tableCounts: TableCounts) {
  return Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
}

export function getNonZeroTableCounts(tableCounts: TableCounts) {
  return Object.entries(tableCounts).filter(([, count]) => count > 0);
}

export function logDatabaseSummary(summary: DatabaseSummary, label: string) {
  console.log(`${label}: users=${summary.totalUsers}, nonDemoUsers=${summary.nonDemoUsers}`);
  const nonZeroCounts = getNonZeroTableCounts(summary.tableCounts);
  console.log(
    nonZeroCounts.length > 0
      ? `Relevant row counts: ${nonZeroCounts.map(([tableName, count]) => `${tableName}=${count}`).join(', ')}`
      : 'Relevant row counts: none',
  );
}

export async function getDatabaseSummary(
  sql: Sql<Record<string, unknown>>,
  countPlan: readonly CountPlanEntry[],
): Promise<DatabaseSummary> {
  const [[totalUsersRow], [nonDemoUsersRow], [demoUserRow]] = await Promise.all([
    sql<CountRow[]>`select count(*)::int as count from users`,
    sql<CountRow[]>`select count(*)::int as count from users where email <> ${DEMO_USER_EMAIL}`,
    sql<DemoUserRow[]>`select id from users where email = ${DEMO_USER_EMAIL} limit 1`,
  ]);

  const tableCounts: TableCounts = {};
  for (const entry of countPlan) {
    tableCounts[entry.tableName] = await getPlannedTableCount(sql, entry, demoUserRow?.id ?? null);
  }

  return {
    demoUserId: demoUserRow?.id ?? null,
    nonDemoUsers: nonDemoUsersRow?.count ?? 0,
    tableCounts,
    totalUsers: totalUsersRow?.count ?? 0,
  };
}

function getPlannedTableCount(
  sql: Sql<Record<string, unknown>>,
  entry: CountPlanEntry,
  demoUserId: number | null,
) {
  if (entry.scope === 'all') {
    return countRows(sql, entry.tableName);
  }

  if (demoUserId === null) {
    return Promise.resolve(0);
  }

  return countRows(sql, entry.tableName, demoUserId);
}

async function countRows(sql: Sql<Record<string, unknown>>, tableName: string, userId?: number) {
  const tableIdentifier = quoteIdentifier(tableName);
  const query =
    userId === undefined
      ? `select count(*)::int as count from ${tableIdentifier}`
      : `select count(*)::int as count from ${tableIdentifier} where user_id = $1`;
  const rows = await sql.unsafe<CountRow[]>(query, userId === undefined ? [] : [userId]);
  return rows[0]?.count ?? 0;
}
