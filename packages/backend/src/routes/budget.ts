import { Hono } from 'hono';
import { db } from '../db/client';
import { budgetCategories, budgetTransactions } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';

const app = new Hono();

// ── Categories ───────────────────────────────────────────────────────────────

app.get('/categories', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(budgetCategories).where(eq(budgetCategories.userId, user.id));
  return c.json({ data });
});

app.get('/categories/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .select()
    .from(budgetCategories)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, user.id)));
  if (!data) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/categories', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const [data] = await db
    .insert(budgetCategories)
    .values({ ...body, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/categories/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(budgetCategories)
    .set(safeBody)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/categories/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .delete(budgetCategories)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Transactions ─────────────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const categoryId = c.req.query('categoryId');
  if (categoryId) {
    const data = await db
      .select()
      .from(budgetTransactions)
      .where(
        and(
          eq(budgetTransactions.categoryId, parseInt(categoryId)),
          eq(budgetTransactions.userId, user.id),
        ),
      );
    return c.json({ data });
  }
  const data = await db
    .select()
    .from(budgetTransactions)
    .where(eq(budgetTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .select()
    .from(budgetTransactions)
    .where(and(eq(budgetTransactions.id, id), eq(budgetTransactions.userId, user.id)));
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const [category] = await db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(and(eq(budgetCategories.id, body.categoryId), eq(budgetCategories.userId, user.id)));
  if (!category) return c.json({ error: 'Category not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(budgetTransactions)
    .values({ ...body, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(budgetTransactions)
    .set(safeBody)
    .where(and(eq(budgetTransactions.id, id), eq(budgetTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .delete(budgetTransactions)
    .where(and(eq(budgetTransactions.id, id), eq(budgetTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
