import { Hono } from 'hono';
import { db } from '../db/client';
import { savingsAccounts, savingsTransactions } from '../db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';

const app = new Hono();

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toSignedSavingsAmount(type: unknown, amount: unknown): number {
  const absoluteAmount = Math.abs(toFiniteNumber(amount));
  return type === 'withdrawal' ? -absoluteAmount : absoluteAmount;
}

async function isSavingsAccountOwnedByUser(accountId: number, userId: number): Promise<boolean> {
  const [account] = await db
    .select({ id: savingsAccounts.id })
    .from(savingsAccounts)
    .where(and(eq(savingsAccounts.id, accountId), eq(savingsAccounts.userId, userId)));
  return Boolean(account);
}

async function updateSavingsAccountBalanceByDelta(
  accountId: number,
  userId: number,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  await db
    .update(savingsAccounts)
    .set({
      balance: sql`CAST(${savingsAccounts.balance} AS numeric) + ${delta}`,
    })
    .where(and(eq(savingsAccounts.id, accountId), eq(savingsAccounts.userId, userId)));
}

async function syncSavingsBalancesForEditedTransaction(params: {
  userId: number;
  previousAccountId: number;
  nextAccountId: number;
  previousType: unknown;
  nextType: unknown;
  previousAmount: unknown;
  nextAmount: unknown;
}): Promise<void> {
  const oldSignedAmount = toSignedSavingsAmount(params.previousType, params.previousAmount);
  const newSignedAmount = toSignedSavingsAmount(params.nextType, params.nextAmount);

  if (params.nextAccountId === params.previousAccountId) {
    await updateSavingsAccountBalanceByDelta(
      params.previousAccountId,
      params.userId,
      newSignedAmount - oldSignedAmount,
    );
    return;
  }

  await updateSavingsAccountBalanceByDelta(
    params.previousAccountId,
    params.userId,
    -oldSignedAmount,
  );
  await updateSavingsAccountBalanceByDelta(params.nextAccountId, params.userId, newSignedAmount);
}

// ── Accounts ─────────────────────────────────────────────────────────────────

app.get('/accounts', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(savingsAccounts).where(eq(savingsAccounts.userId, user.id));
  return c.json({ data });
});

app.get('/accounts/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .select()
    .from(savingsAccounts)
    .where(and(eq(savingsAccounts.id, id), eq(savingsAccounts.userId, user.id)));
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/accounts', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const [data] = await db
    .insert(savingsAccounts)
    .values({ ...body, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/accounts/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(savingsAccounts)
    .set(safeBody)
    .where(and(eq(savingsAccounts.id, id), eq(savingsAccounts.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/accounts/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .delete(savingsAccounts)
    .where(and(eq(savingsAccounts.id, id), eq(savingsAccounts.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Transactions ─────────────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const accountId = c.req.query('accountId');
  if (accountId) {
    const data = await db
      .select()
      .from(savingsTransactions)
      .where(
        and(
          eq(savingsTransactions.accountId, parseInt(accountId)),
          eq(savingsTransactions.userId, user.id),
        ),
      );
    return c.json({ data });
  }
  const data = await db
    .select()
    .from(savingsTransactions)
    .where(eq(savingsTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .select()
    .from(savingsTransactions)
    .where(and(eq(savingsTransactions.id, id), eq(savingsTransactions.userId, user.id)));
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const [account] = await db
    .select()
    .from(savingsAccounts)
    .where(and(eq(savingsAccounts.id, body.accountId), eq(savingsAccounts.userId, user.id)));
  if (!account) return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(savingsTransactions)
    .values({ ...body, userId: user.id })
    .returning();

  // Keep account balance in sync with recorded transactions.
  await db
    .update(savingsAccounts)
    .set({
      balance: sql`CAST(${savingsAccounts.balance} AS numeric) + ${
        body.type === 'withdrawal' ? -Math.abs(body.amount) : Math.abs(body.amount)
      }`,
    })
    .where(and(eq(savingsAccounts.id, body.accountId), eq(savingsAccounts.userId, user.id)));

  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};

  const [existing] = await db
    .select()
    .from(savingsTransactions)
    .where(and(eq(savingsTransactions.id, id), eq(savingsTransactions.userId, user.id)));
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const nextAccountId = Number(safeBody.accountId ?? existing.accountId);
  const nextType = safeBody.type ?? existing.type;
  const nextAmount = safeBody.amount ?? existing.amount;

  if (!Number.isInteger(nextAccountId) || nextAccountId <= 0) {
    return c.json({ error: 'Invalid account id' }, HTTP_STATUS.BAD_REQUEST);
  }

  if (
    nextAccountId !== existing.accountId &&
    !(await isSavingsAccountOwnedByUser(nextAccountId, user.id))
  ) {
    return c.json({ error: 'Account not found' }, HTTP_STATUS.NOT_FOUND);
  }

  const [data] = await db
    .update(savingsTransactions)
    .set(safeBody)
    .where(and(eq(savingsTransactions.id, id), eq(savingsTransactions.userId, user.id)))
    .returning();

  await syncSavingsBalancesForEditedTransaction({
    userId: user.id,
    previousAccountId: existing.accountId,
    nextAccountId,
    previousType: existing.type,
    nextType,
    previousAmount: existing.amount,
    nextAmount,
  });

  return c.json({ data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseInt(c.req.param('id'));
  const [data] = await db
    .delete(savingsTransactions)
    .where(and(eq(savingsTransactions.id, id), eq(savingsTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  await db
    .update(savingsAccounts)
    .set({
      balance: sql`CAST(${savingsAccounts.balance} AS numeric) + ${
        data.type === 'withdrawal' ? Math.abs(Number(data.amount)) : -Math.abs(Number(data.amount))
      }`,
    })
    .where(and(eq(savingsAccounts.id, data.accountId), eq(savingsAccounts.userId, user.id)));

  return c.json({ data });
});

export default app;
