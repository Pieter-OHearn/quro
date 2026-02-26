import { Hono } from 'hono';
import { db } from '../db/client';
import { goals } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';

const app = new Hono();

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(goals).where(eq(goals.userId, user.id));
  return c.json({ data });
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)));
  if (!data) return c.json({ error: 'Goal not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const [data] = await db
    .insert(goals)
    .values({ ...body, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(goals)
    .set(safeBody)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Goal not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Goal not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
