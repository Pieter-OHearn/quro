import { and, eq, getTableColumns, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db, type DbExecutor } from '../db/client';
import { ownedOrJointPredicate } from './partner';

export type OwnedTable = PgTable & { id: PgColumn; userId: PgColumn };
export type JointTable = OwnedTable & { isJoint: PgColumn };
export type AccessScope = { userId: number; partnerId: number | null };

export function accessPredicate(table: OwnedTable, scope: Readonly<AccessScope>): SQL {
  return 'isJoint' in table
    ? ownedOrJointPredicate(table as JointTable, scope.userId, scope.partnerId)
    : eq(table.userId, scope.userId);
}

async function findRow<T extends PgTable>(
  table: T,
  predicate: SQL | undefined,
  executor: DbExecutor,
): Promise<T['$inferSelect'] | null> {
  // Drizzle cannot infer the columns of a generic PgTable at the query boundary.
  // Selecting the complete table preserves its inferred row shape.
  const rows = await executor
    .select()
    .from(table as PgTable)
    .where(predicate)
    .limit(1);
  return (rows[0] as T['$inferSelect'] | undefined) ?? null;
}

export function findOwnedRow<T extends OwnedTable>(
  table: T,
  id: number,
  userId: number,
  executor: DbExecutor = db,
): Promise<T['$inferSelect'] | null> {
  return findRow(table, and(eq(table.id, id), eq(table.userId, userId)), executor);
}

export function findAccessible<T extends OwnedTable>(
  table: T,
  id: number,
  scope: Readonly<AccessScope>,
  options: { where?: SQL; executor?: DbExecutor } = {},
): Promise<T['$inferSelect'] | null> {
  return findRow(
    table,
    and(eq(table.id, id), accessPredicate(table, scope), options.where),
    options.executor ?? db,
  );
}

export type ChildResource<T extends OwnedTable = OwnedTable> = {
  table: T;
  parent: OwnedTable;
  parentId: PgColumn;
};

export async function listChildRows<T extends OwnedTable>(
  resource: Readonly<ChildResource<T>>,
  scope: Readonly<AccessScope>,
  options: {
    id?: number;
    parentId?: number;
    where?: SQL;
    orderBy?: SQL[];
    limit?: number;
    executor?: DbExecutor;
    scopeByChildOwner?: boolean;
  } = {},
): Promise<T['$inferSelect'][]> {
  const { table, parent, parentId } = resource;
  const columns = getTableColumns(table as PgTable);
  const query = (options.executor ?? db)
    .select(columns)
    .from(table as PgTable)
    .$dynamic();
  const scopedQuery = options.scopeByChildOwner
    ? query
    : query.innerJoin(parent, eq(parentId, parent.id));
  const filtered = scopedQuery.where(
    and(
      options.scopeByChildOwner ? eq(table.userId, scope.userId) : accessPredicate(parent, scope),
      options.id === undefined ? undefined : eq(table.id, options.id),
      options.parentId === undefined ? undefined : eq(parentId, options.parentId),
      options.where,
    ),
  );
  const ordered = options.orderBy ? filtered.orderBy(...options.orderBy) : filtered;
  const rows = await (options.limit === undefined ? ordered : ordered.limit(options.limit));
  return rows as T['$inferSelect'][];
}

export async function findAccessibleChild<T extends OwnedTable>(
  resource: Readonly<ChildResource<T>>,
  id: number,
  scope: Readonly<AccessScope>,
  executor: DbExecutor = db,
): Promise<T['$inferSelect'] | null> {
  const rows = await listChildRows(resource, scope, { id, executor });
  return rows[0] ?? null;
}
