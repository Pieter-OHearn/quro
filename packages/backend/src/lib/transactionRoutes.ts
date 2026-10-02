import type { Hono } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { findAccessible, listChildRows, type ChildResource } from './access';
import { getAuthUser, getPartnerId } from './authUser';
import { parseId } from './requestValidation';

type TransactionReadOptions = ChildResource & {
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
    if (parentId !== undefined && options.checkParent) {
      const parent = await findAccessible(options.parent, parentId, scope);
      if (!parent)
        return c.json({ error: `${options.parentLabel} not found` }, HTTP_STATUS.NOT_FOUND);
    }
    const data = await listChildRows(options, scope, {
      parentId,
      scopeByChildOwner: options.scopeByChildOwner,
    });
    return c.json({ data });
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
