import type { Hono } from 'hono';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { HTTP_STATUS } from '../constants/http';
import { findAccessible, listChildRows, type ChildResource, type OwnedTable } from './access';
import { getAuthUser, getPartnerId } from './authUser';
import { ledgerOrder, ledgerPosition, parseListPageQuery, readListPage } from './listPage';
import { parseId } from './requestValidation';

type TransactionReadOptions = ChildResource<OwnedTable & { date: PgColumn }> & {
  path: string;
  parentQuery: string;
  parentLabel: string;
  parentIdLabel: string;
  // Personal ledgers historically return an empty list for an inaccessible parent.
  checkParent?: boolean;
  emptyParentIsAbsent?: boolean;
  scopeByChildOwner?: boolean;
};

export function registerTransactionReadRoutes(
  app: Hono,
  options: Readonly<TransactionReadOptions>,
): void {
  app.get(options.path, async (c) => {
    const scope = { userId: getAuthUser(c).id, partnerId: getPartnerId(c) };
    const rawId = c.req.query(options.parentQuery);
    const hasParent = options.emptyParentIsAbsent ? Boolean(rawId) : rawId !== undefined;
    const parentId = hasParent ? parseId(rawId ?? '') : undefined;
    if (parentId === null) {
      return c.json({ error: `Invalid ${options.parentIdLabel} id` }, HTTP_STATUS.BAD_REQUEST);
    }
    const pageRequest = parseListPageQuery(c.req, 'date');
    if (!pageRequest.ok) return c.json({ error: pageRequest.error }, HTTP_STATUS.BAD_REQUEST);
    if (parentId !== undefined && options.checkParent) {
      const parent = await findAccessible(options.parent, parentId, scope);
      if (!parent)
        return c.json({ error: `${options.parentLabel} not found` }, HTTP_STATUS.NOT_FOUND);
    }
    const page = await readListPage(
      pageRequest.value,
      ledgerOrder(options.table),
      (window) =>
        listChildRows(options, scope, {
          parentId,
          scopeByChildOwner: options.scopeByChildOwner,
          ...window,
        }),
      ledgerPosition,
    );
    return c.json(page);
  });
  app.get(`${options.path}/:id`, async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
    const scope = { userId: getAuthUser(c).id, partnerId: getPartnerId(c) };
    const rows = await listChildRows(options, scope, {
      id,
      scopeByChildOwner: options.scopeByChildOwner,
    });
    const data = rows[0];
    if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
    return c.json({ data });
  });
}
