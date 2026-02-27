import { Hono } from 'hono';
import { db } from '../db/client';
import {
  holdings,
  holdingTransactions,
  mortgages,
  properties,
  propertyTransactions,
} from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';

const app = new Hono();
const MAX_INT32 = 2_147_483_647;

function parseId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_INT32) return null;
  return parsed;
}

function parseOptionalId(value: unknown): number | null | 'invalid' {
  if (value == null || value === '') return null;
  const parsed = parseId(String(value));
  if (parsed === null) return 'invalid';
  return parsed;
}

// ── Holdings ─────────────────────────────────────────────────────────────────

app.get('/holdings', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(holdings).where(eq(holdings.userId, user.id));
  return c.json({ data });
});

app.get('/holdings/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid holding id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, id), eq(holdings.userId, user.id)));
  if (!data) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/holdings', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const [data] = await db
    .insert(holdings)
    .values({ ...body, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/holdings/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid holding id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(holdings)
    .set(safeBody)
    .where(and(eq(holdings.id, id), eq(holdings.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/holdings/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid holding id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(holdings)
    .where(and(eq(holdings.id, id), eq(holdings.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Holding Transactions ─────────────────────────────────────────────────────

app.get('/holding-transactions', async (c) => {
  const user = getAuthUser(c);
  const holdingId = c.req.query('holdingId');
  if (holdingId) {
    const parsedHoldingId = parseId(holdingId);
    if (parsedHoldingId === null)
      return c.json({ error: 'Invalid holding id' }, HTTP_STATUS.BAD_REQUEST);
    const data = await db
      .select()
      .from(holdingTransactions)
      .where(
        and(
          eq(holdingTransactions.holdingId, parsedHoldingId),
          eq(holdingTransactions.userId, user.id),
        ),
      );
    return c.json({ data });
  }
  const data = await db
    .select()
    .from(holdingTransactions)
    .where(eq(holdingTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/holding-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(holdingTransactions)
    .where(and(eq(holdingTransactions.id, id), eq(holdingTransactions.userId, user.id)));
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/holding-transactions', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const holdingId = parseId(String(body.holdingId));
  if (holdingId === null) return c.json({ error: 'Invalid holding id' }, HTTP_STATUS.BAD_REQUEST);
  const [holding] = await db
    .select({ id: holdings.id })
    .from(holdings)
    .where(and(eq(holdings.id, holdingId), eq(holdings.userId, user.id)));
  if (!holding) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(holdingTransactions)
    .values({ ...body, holdingId, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/holding-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(holdingTransactions)
    .set(safeBody)
    .where(and(eq(holdingTransactions.id, id), eq(holdingTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/holding-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(holdingTransactions)
    .where(and(eq(holdingTransactions.id, id), eq(holdingTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Properties ───────────────────────────────────────────────────────────────

app.get('/properties', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(properties).where(eq(properties.userId, user.id));
  return c.json({ data });
});

app.get('/properties/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid property id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)));
  if (!data) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/properties', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const { userId: _ignoredUserId, mortgageId: rawMortgageId, ...safeBody } = body ?? {};

  const mortgageId = parseOptionalId(rawMortgageId);
  if (mortgageId === 'invalid')
    return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);

  if (mortgageId !== null) {
    const [mortgage] = await db
      .select({ id: mortgages.id })
      .from(mortgages)
      .where(and(eq(mortgages.id, mortgageId), eq(mortgages.userId, user.id)));
    if (!mortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);
  }

  const [data] = await db
    .insert(properties)
    .values({
      ...safeBody,
      mortgage: safeBody.mortgage ?? 0,
      mortgageId,
      userId: user.id,
    } as any)
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/properties/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid property id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await c.req.json();
  const { userId: _ignoredUserId, mortgageId: rawMortgageId, ...safeBody } = body ?? {};

  const updates: Record<string, unknown> = { ...safeBody };
  if (rawMortgageId !== undefined) {
    const mortgageId = parseOptionalId(rawMortgageId);
    if (mortgageId === 'invalid')
      return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);

    if (mortgageId !== null) {
      const [mortgage] = await db
        .select({ id: mortgages.id })
        .from(mortgages)
        .where(and(eq(mortgages.id, mortgageId), eq(mortgages.userId, user.id)));
      if (!mortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);
    }

    updates.mortgageId = mortgageId;
  }

  const [data] = await db
    .update(properties)
    .set(updates as any)
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/properties/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid property id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Property Transactions ────────────────────────────────────────────────────

app.get('/property-transactions', async (c) => {
  const user = getAuthUser(c);
  const propertyId = c.req.query('propertyId');
  if (propertyId) {
    const parsedPropertyId = parseId(propertyId);
    if (parsedPropertyId === null)
      return c.json({ error: 'Invalid property id' }, HTTP_STATUS.BAD_REQUEST);
    const data = await db
      .select()
      .from(propertyTransactions)
      .where(
        and(
          eq(propertyTransactions.propertyId, parsedPropertyId),
          eq(propertyTransactions.userId, user.id),
        ),
      );
    return c.json({ data });
  }
  const data = await db
    .select()
    .from(propertyTransactions)
    .where(eq(propertyTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/property-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(propertyTransactions)
    .where(and(eq(propertyTransactions.id, id), eq(propertyTransactions.userId, user.id)));
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/property-transactions', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const propertyId = parseId(String(body.propertyId));
  if (propertyId === null) return c.json({ error: 'Invalid property id' }, HTTP_STATUS.BAD_REQUEST);
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, user.id)));
  if (!property) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(propertyTransactions)
    .values({ ...body, propertyId, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/property-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(propertyTransactions)
    .set(safeBody)
    .where(and(eq(propertyTransactions.id, id), eq(propertyTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/property-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(propertyTransactions)
    .where(and(eq(propertyTransactions.id, id), eq(propertyTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
