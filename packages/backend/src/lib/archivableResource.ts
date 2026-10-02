import type { Context, Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import type { PgColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { db, type DbTransaction } from '../db/client';
import { HTTP_STATUS } from '../constants/http';
import { accessPredicate, type AccessScope, type OwnedTable } from './access';
import { getAuthUser, getPartnerId } from './authUser';
import { parseId } from './requestValidation';

type ArchivableTable = OwnedTable & { archivedAt: PgColumn };
type LifecycleError = { error: string; status: 409 };
type LifecycleHook<T extends ArchivableTable> = (
  tx: DbTransaction,
  row: T['$inferSelect'],
) => Promise<LifecycleError | null>;
type ResourceOptions<T extends ArchivableTable> = {
  path: string;
  table: T;
  label: string;
  idLabel: string;
  scope?: (scope: Readonly<AccessScope>) => ReturnType<typeof accessPredicate>;
  beforeDelete?: LifecycleHook<T>;
  beforeUnarchive?: LifecycleHook<T>;
  serialize?: (row: T['$inferSelect']) => Promise<T['$inferSelect']>;
};

function mutateResource<T extends ArchivableTable>(
  options: Readonly<ResourceOptions<T>>,
  id: number,
  scope: Readonly<AccessScope>,
  action: 'archive' | 'unarchive' | 'delete',
): Promise<{ data: T['$inferSelect'] | null } | LifecycleError> {
  const { table } = options;
  const predicate = and(eq(table.id, id), options.scope?.(scope) ?? accessPredicate(table, scope));
  return db.transaction(async (tx) => {
    const hook = action === 'delete' ? options.beforeDelete : options.beforeUnarchive;
    if (action !== 'archive' && hook) {
      const [row] = await tx
        .select()
        .from(table as PgTable)
        .where(predicate)
        .for('update');
      if (!row) return { data: null };
      const error = await hook(tx, row as T['$inferSelect']);
      if (error) return error;
    }
    const rows =
      action === 'delete'
        ? await tx
            .delete(table as PgTable)
            .where(predicate)
            .returning()
        : await tx
            .update(table as PgTable)
            .set({
              archivedAt: action === 'archive' ? new Date() : null,
            } as PgUpdateSetSource<PgTable>)
            .where(action === 'archive' ? and(predicate, isNull(table.archivedAt)) : predicate)
            .returning();
    return { data: (rows[0] as T['$inferSelect'] | undefined) ?? null };
  });
}

export function registerArchivableResource<T extends ArchivableTable>(
  app: Hono,
  options: Readonly<ResourceOptions<T>>,
): void {
  const handle = (action: 'archive' | 'unarchive') => async (c: Context) => {
    const id = parseId(c.req.param('id') ?? '');
    if (id === null)
      return c.json({ error: `Invalid ${options.idLabel} id` }, HTTP_STATUS.BAD_REQUEST);
    const user = getAuthUser(c);
    const result = await mutateResource(
      options,
      id,
      { userId: user.id, partnerId: getPartnerId(c) },
      action === 'archive' && c.req.query('cascade') === 'true' ? 'delete' : action,
    );
    if ('error' in result) return c.json({ error: result.error }, result.status);
    if (!result.data) return c.json({ error: `${options.label} not found` }, HTTP_STATUS.NOT_FOUND);
    return c.json({ data: options.serialize ? await options.serialize(result.data) : result.data });
  };
  app.delete(`${options.path}/:id`, handle('archive'));
  app.post(`${options.path}/:id/unarchive`, handle('unarchive'));
}
