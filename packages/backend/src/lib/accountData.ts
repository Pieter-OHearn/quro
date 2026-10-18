import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
  budgetCategories,
  budgetTransactions,
  categoryMappings,
  csvImportRows,
  csvImports,
  debtPayments,
  debts,
  employments,
  exposureSettings,
  goals,
  holdingPriceHistory,
  holdingTransactions,
  holdings,
  importProfiles,
  mortgageTransactions,
  mortgages,
  netWorthSnapshots,
  payslips,
  pensionPots,
  pensionStatementImportRows,
  pensionStatementImports,
  pensionTransactions,
  planAssumptions,
  properties,
  propertyTransactions,
  savingsAccounts,
  savingsTransactions,
  users,
} from '../db/schema';
import { db, type DbExecutor } from '../db/client';

// The tables that hold an account's own data, parents before children. A data export reads them
// in this order and an account deletion removes them in reverse, so a child row never outlives
// the row it refers to.
//
// A row belongs to the account when the account owns it or owns its parent: a ledger row that a
// partner entered on a joint account is part of that account's ledger. Rows an account entered
// on its partner's joint accounts belong to the partner (deletion hands them over).
//
// What the registry leaves out on purpose, for exports: password hash and session, sign-in code,
// bank-link, partner-link and background-job state (secrets and housekeeping, not financial
// data), and the shared exchange-rate and stock-exchange reference tables.

/** The row properties that describe a stored document. */
type DocumentColumns = {
  key: string;
  fileName: string;
  sizeBytes: string;
  /** Set when the stored object is already gone (statement uploads expire). */
  deletedAt?: string;
};

export type AccountTable = {
  /** The database table name, also the file name stem in an export. */
  name: string;
  table: PgTable & { id: AnyPgColumn };
  /** The rows that belong to the account. */
  scope: (userId: number) => SQL;
  /** Row properties left out of exports: internal keys and secrets. */
  omit: readonly string[];
  document?: DocumentColumns;
  /** Joint ledgers: the row's `userId` may be the partner who entered it. */
  entryUser?: AnyPgColumn;
};

type OwnedTable = PgTable & { id: AnyPgColumn; userId: AnyPgColumn };

const owned = (table: OwnedTable) => (userId: number) => eq(table.userId, userId);

function ownedParents(parent: OwnedTable, userId: number) {
  return db.select({ id: parent.id }).from(parent).where(eq(parent.userId, userId));
}

function childOf(foreignKey: AnyPgColumn, parent: OwnedTable) {
  return (userId: number) => inArray(foreignKey, ownedParents(parent, userId));
}

const OWNER = ['userId'] as const;
const OWNER_AND_DOCUMENT = ['userId', 'documentStorageKey'] as const;

export const ACCOUNT_TABLES: readonly AccountTable[] = [
  {
    name: 'users',
    table: users,
    scope: (userId) => eq(users.id, userId),
    omit: ['passwordHash', 'passwordUpdatedAt'],
  },
  { name: 'employments', table: employments, scope: owned(employments), omit: OWNER },
  { name: 'plan_assumptions', table: planAssumptions, scope: owned(planAssumptions), omit: OWNER },
  {
    name: 'exposure_settings',
    table: exposureSettings,
    scope: owned(exposureSettings),
    omit: OWNER,
  },
  { name: 'savings_accounts', table: savingsAccounts, scope: owned(savingsAccounts), omit: OWNER },
  { name: 'import_profiles', table: importProfiles, scope: owned(importProfiles), omit: OWNER },
  { name: 'csv_imports', table: csvImports, scope: owned(csvImports), omit: OWNER },
  {
    name: 'csv_import_rows',
    table: csvImportRows,
    scope: childOf(csvImportRows.importId, csvImports),
    omit: [],
  },
  {
    name: 'savings_transactions',
    table: savingsTransactions,
    scope: childOf(savingsTransactions.accountId, savingsAccounts),
    omit: OWNER,
    entryUser: savingsTransactions.userId,
  },
  { name: 'holdings', table: holdings, scope: owned(holdings), omit: OWNER },
  {
    name: 'holding_transactions',
    table: holdingTransactions,
    scope: childOf(holdingTransactions.holdingId, holdings),
    omit: OWNER,
  },
  {
    name: 'holding_price_history',
    table: holdingPriceHistory,
    scope: childOf(holdingPriceHistory.holdingId, holdings),
    omit: OWNER,
  },
  { name: 'mortgages', table: mortgages, scope: owned(mortgages), omit: OWNER },
  { name: 'properties', table: properties, scope: owned(properties), omit: OWNER },
  {
    name: 'property_transactions',
    table: propertyTransactions,
    scope: childOf(propertyTransactions.propertyId, properties),
    omit: OWNER,
    entryUser: propertyTransactions.userId,
  },
  {
    name: 'mortgage_transactions',
    table: mortgageTransactions,
    scope: childOf(mortgageTransactions.mortgageId, mortgages),
    omit: OWNER,
    entryUser: mortgageTransactions.userId,
  },
  { name: 'pension_pots', table: pensionPots, scope: owned(pensionPots), omit: OWNER },
  {
    name: 'pension_transactions',
    table: pensionTransactions,
    scope: childOf(pensionTransactions.potId, pensionPots),
    omit: OWNER_AND_DOCUMENT,
    document: {
      key: 'documentStorageKey',
      fileName: 'documentFileName',
      sizeBytes: 'documentSizeBytes',
    },
  },
  {
    name: 'pension_statement_imports',
    table: pensionStatementImports,
    scope: owned(pensionStatementImports),
    omit: ['userId', 'storageKey'],
    document: {
      key: 'storageKey',
      fileName: 'fileName',
      sizeBytes: 'sizeBytes',
      deletedAt: 'storageDeletedAt',
    },
  },
  {
    name: 'pension_statement_import_rows',
    table: pensionStatementImportRows,
    scope: childOf(pensionStatementImportRows.importId, pensionStatementImports),
    omit: [],
  },
  { name: 'debts', table: debts, scope: owned(debts), omit: OWNER },
  {
    name: 'debt_payments',
    table: debtPayments,
    scope: childOf(debtPayments.debtId, debts),
    omit: OWNER,
  },
  {
    name: 'payslips',
    table: payslips,
    scope: owned(payslips),
    omit: OWNER_AND_DOCUMENT,
    document: {
      key: 'documentStorageKey',
      fileName: 'documentFileName',
      sizeBytes: 'documentSizeBytes',
    },
  },
  { name: 'goals', table: goals, scope: owned(goals), omit: OWNER },
  {
    name: 'budget_categories',
    table: budgetCategories,
    scope: owned(budgetCategories),
    omit: OWNER,
  },
  {
    name: 'budget_transactions',
    table: budgetTransactions,
    scope: childOf(budgetTransactions.categoryId, budgetCategories),
    omit: OWNER,
  },
  {
    name: 'category_mappings',
    table: categoryMappings,
    scope: owned(categoryMappings),
    omit: OWNER,
  },
  {
    name: 'net_worth_snapshots',
    table: netWorthSnapshots,
    scope: owned(netWorthSnapshots),
    omit: OWNER,
  },
];

/** The rows of `entry` that belong to the account, in id order, as stored. */
export async function selectAccountRows(
  executor: DbExecutor,
  entry: AccountTable,
  userId: number,
): Promise<Record<string, unknown>[]> {
  const rows = await executor
    .select()
    .from(entry.table)
    .where(entry.scope(userId))
    .orderBy(entry.table.id);
  return rows as Record<string, unknown>[];
}

export async function countAccountRows(
  executor: DbExecutor,
  entry: AccountTable,
  userId: number,
): Promise<number> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(entry.table)
    .where(entry.scope(userId));
  return row?.count ?? 0;
}

/** The stored document the row refers to, or null when it has none (or it is already gone). */
export function documentOfRow(
  entry: AccountTable,
  row: Record<string, unknown>,
): { key: string; fileName: string; sizeBytes: number | null } | null {
  const columns = entry.document;
  if (!columns) return null;
  const key = row[columns.key];
  if (typeof key !== 'string' || key === '') return null;
  if (columns.deletedAt && row[columns.deletedAt] != null) return null;
  const fileName = row[columns.fileName];
  const sizeBytes = row[columns.sizeBytes];
  return {
    key,
    fileName: typeof fileName === 'string' ? fileName : 'document',
    sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : null,
  };
}
