import { Hono } from 'hono';
import { db } from '../db/client';
import { pensionPots, pensionTransactions } from '../db/schema';
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

// ── Pots ─────────────────────────────────────────────────────────────────────

app.get('/pots', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(pensionPots).where(eq(pensionPots.userId, user.id));
  return c.json({ data });
});

app.get('/pots/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(pensionPots)
    .where(and(eq(pensionPots.id, id), eq(pensionPots.userId, user.id)));
  if (!data) return c.json({ error: 'Pension pot not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/pots', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const [data] = await db
    .insert(pensionPots)
    .values({ ...body, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/pots/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(pensionPots)
    .set(safeBody)
    .where(and(eq(pensionPots.id, id), eq(pensionPots.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Pension pot not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/pots/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(pensionPots)
    .where(and(eq(pensionPots.id, id), eq(pensionPots.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Pension pot not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Transactions ─────────────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const potId = c.req.query('potId');
  if (potId !== undefined) {
    const parsedPotId = parseId(potId);
    if (parsedPotId === null)
      return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
    const data = await db
      .select()
      .from(pensionTransactions)
      .where(
        and(eq(pensionTransactions.potId, parsedPotId), eq(pensionTransactions.userId, user.id)),
      );
    return c.json({ data });
  }
  const data = await db
    .select()
    .from(pensionTransactions)
    .where(eq(pensionTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(pensionTransactions)
    .where(and(eq(pensionTransactions.id, id), eq(pensionTransactions.userId, user.id)));
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const potId = parseId(String(body?.potId));
  if (potId === null) return c.json({ error: 'Invalid pension pot id' }, HTTP_STATUS.BAD_REQUEST);
  const [pot] = await db
    .select({ id: pensionPots.id })
    .from(pensionPots)
    .where(and(eq(pensionPots.id, potId), eq(pensionPots.userId, user.id)));
  if (!pot) return c.json({ error: 'Pension pot not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(pensionTransactions)
    .values({ ...body, potId, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(pensionTransactions)
    .set(safeBody)
    .where(and(eq(pensionTransactions.id, id), eq(pensionTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(pensionTransactions)
    .where(and(eq(pensionTransactions.id, id), eq(pensionTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
