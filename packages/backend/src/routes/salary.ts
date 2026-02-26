import { Hono } from 'hono';
import { db } from '../db/client';
import { payslips, salaryHistory } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';

const app = new Hono();

// ── Payslips ─────────────────────────────────────────────────────────────────

app.get('/payslips', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(payslips).where(eq(payslips.userId, user.id));
  return c.json({ data });
});

app.get('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .select()
    .from(payslips)
    .where(and(eq(payslips.id, id), eq(payslips.userId, user.id)));
  if (!data) return c.json({ error: 'Payslip not found' }, 404);
  return c.json({ data });
});

app.post('/payslips', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const [data] = await db
    .insert(payslips)
    .values({ ...body, userId: user.id })
    .returning();
  return c.json({ data }, 201);
});

app.patch('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(payslips)
    .set(safeBody)
    .where(and(eq(payslips.id, id), eq(payslips.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Payslip not found' }, 404);
  return c.json({ data });
});

app.delete('/payslips/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .delete(payslips)
    .where(and(eq(payslips.id, id), eq(payslips.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Payslip not found' }, 404);
  return c.json({ data });
});

// ── Salary History ───────────────────────────────────────────────────────────

app.get('/history', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(salaryHistory).where(eq(salaryHistory.userId, user.id));
  return c.json({ data });
});

app.get('/history/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .select()
    .from(salaryHistory)
    .where(and(eq(salaryHistory.id, id), eq(salaryHistory.userId, user.id)));
  if (!data) return c.json({ error: 'Salary history entry not found' }, 404);
  return c.json({ data });
});

app.post('/history', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const [data] = await db
    .insert(salaryHistory)
    .values({ ...body, userId: user.id })
    .returning();
  return c.json({ data }, 201);
});

app.patch('/history/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(salaryHistory)
    .set(safeBody)
    .where(and(eq(salaryHistory.id, id), eq(salaryHistory.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Salary history entry not found' }, 404);
  return c.json({ data });
});

app.delete('/history/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .delete(salaryHistory)
    .where(and(eq(salaryHistory.id, id), eq(salaryHistory.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Salary history entry not found' }, 404);
  return c.json({ data });
});

export default app;
