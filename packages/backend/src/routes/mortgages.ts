import { Hono } from 'hono';
import { db } from '../db/client';
import { mortgages, mortgageTransactions, properties } from '../db/schema';
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

type LinkedProperty = {
  id: number;
  address: string;
  currency: string;
  currentValue: unknown;
  mortgageId: number | null;
};

function resolveNextPropertyId(
  raw: unknown,
  currentId: number | null,
): { ok: true; id: number | null } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, id: currentId };
  const parsed = parseOptionalId(raw);
  if (parsed === 'invalid') return { ok: false, error: 'Invalid linkedPropertyId' };
  if (parsed === null) return { ok: false, error: 'Mortgage must be linked to a property' };
  return { ok: true, id: parsed };
}

async function fetchLinkedProperty(
  userId: number,
  propertyId: number,
  mortgageId: number,
): Promise<
  { ok: true; property: LinkedProperty } | { ok: false; error: string; status: 404 | 409 }
> {
  const [property] = await db
    .select({
      id: properties.id,
      address: properties.address,
      currency: properties.currency,
      currentValue: properties.currentValue,
      mortgageId: properties.mortgageId,
    })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)));
  if (!property) return { ok: false, error: 'Property not found', status: 404 };
  if (property.mortgageId != null && property.mortgageId !== mortgageId) {
    return { ok: false, error: 'Property already has a linked mortgage', status: 409 };
  }
  return { ok: true, property };
}

async function resolveLinkedProperty(
  rawLinkedPropertyId: unknown,
  currentPropertyId: number | null,
  userId: number,
  mortgageId: number,
): Promise<
  | { ok: true; nextId: number | null; property: LinkedProperty | null }
  | { ok: false; error: string; status: number }
> {
  const nextIdResult = resolveNextPropertyId(rawLinkedPropertyId, currentPropertyId);
  if (!nextIdResult.ok)
    return { ok: false, error: nextIdResult.error, status: HTTP_STATUS.BAD_REQUEST };
  const nextId = nextIdResult.id;
  if (nextId == null) return { ok: true, nextId: null, property: null };
  const result = await fetchLinkedProperty(userId, nextId, mortgageId);
  if (!result.ok) return { ok: false, error: result.error, status: result.status };
  return { ok: true, nextId, property: result.property };
}

function buildMortgageUpdates(
  safeBody: Readonly<Record<string, unknown>>,
  property: LinkedProperty | null,
): Record<string, unknown> {
  const updates: Record<string, unknown> = { ...safeBody };
  if (property) {
    updates.propertyAddress = property.address;
    updates.currency = property.currency;
    if (updates.propertyValue === undefined) updates.propertyValue = property.currentValue;
  }
  return updates;
}

async function syncLinkedProperty(
  userId: number,
  prevId: number | null,
  nextId: number | null,
  mortgageId: number,
  balance: unknown,
) {
  if (prevId != null && prevId !== nextId) {
    await db
      .update(properties)
      .set({ mortgageId: null, mortgage: 0 } as any)
      .where(and(eq(properties.id, prevId), eq(properties.userId, userId)));
  }
  if (nextId != null) {
    await db
      .update(properties)
      .set({ mortgageId, mortgage: balance } as any)
      .where(and(eq(properties.id, nextId), eq(properties.userId, userId)));
  }
}

// ── Mortgages ────────────────────────────────────────────────────────────────

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(mortgages).where(eq(mortgages.userId, user.id));
  return c.json({ data });
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(mortgages)
    .where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)));
  if (!data) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const { userId: _ignoredUserId, linkedPropertyId: rawLinkedPropertyId, ...safeBody } = body ?? {};
  const linkedPropertyId = parseId(String(rawLinkedPropertyId));
  if (linkedPropertyId === null)
    return c.json({ error: 'linkedPropertyId is required' }, HTTP_STATUS.BAD_REQUEST);

  const [property] = await db
    .select({
      id: properties.id,
      address: properties.address,
      currency: properties.currency,
      currentValue: properties.currentValue,
      mortgageId: properties.mortgageId,
    })
    .from(properties)
    .where(and(eq(properties.id, linkedPropertyId), eq(properties.userId, user.id)));
  if (!property) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);
  if (property.mortgageId != null)
    return c.json({ error: 'Property already has a linked mortgage' }, HTTP_STATUS.CONFLICT);

  const [data] = await db
    .insert(mortgages)
    .values({
      ...safeBody,
      propertyAddress: property.address,
      currency: property.currency,
      propertyValue: property.currentValue,
      userId: user.id,
    } as any)
    .returning();

  await db
    .update(properties)
    .set({
      mortgageId: data.id,
      mortgage: safeBody.outstandingBalance ?? 0,
    } as any)
    .where(and(eq(properties.id, property.id), eq(properties.userId, user.id)));

  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await c.req.json();
  const { userId: _ignoredUserId, linkedPropertyId: rawLinkedPropertyId, ...safeBody } = body ?? {};

  const [existingMortgage] = await db
    .select({ id: mortgages.id })
    .from(mortgages)
    .where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)));
  if (!existingMortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);

  const [currentLinkedProperty] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.userId, user.id), eq(properties.mortgageId, id)));

  const currentPropertyId = currentLinkedProperty?.id ?? null;
  const resolved = await resolveLinkedProperty(rawLinkedPropertyId, currentPropertyId, user.id, id);
  if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status);

  const updates = buildMortgageUpdates(safeBody, resolved.property);
  const [data] = await db
    .update(mortgages)
    .set(updates as any)
    .where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);

  await syncLinkedProperty(
    user.id,
    currentPropertyId,
    resolved.nextId,
    id,
    updates.outstandingBalance ?? data.outstandingBalance,
  );
  return c.json({ data });
});

app.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);

  await db
    .update(properties)
    .set({ mortgageId: null, mortgage: 0 } as any)
    .where(and(eq(properties.mortgageId, id), eq(properties.userId, user.id)));

  const [data] = await db
    .delete(mortgages)
    .where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

// ── Mortgage Transactions ────────────────────────────────────────────────────

app.get('/transactions', async (c) => {
  const user = getAuthUser(c);
  const mortgageId = c.req.query('mortgageId');
  if (mortgageId) {
    const parsedMortgageId = parseId(mortgageId);
    if (parsedMortgageId === null)
      return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);
    const data = await db
      .select()
      .from(mortgageTransactions)
      .where(
        and(
          eq(mortgageTransactions.mortgageId, parsedMortgageId),
          eq(mortgageTransactions.userId, user.id),
        ),
      );
    return c.json({ data });
  }
  const data = await db
    .select()
    .from(mortgageTransactions)
    .where(eq(mortgageTransactions.userId, user.id));
  return c.json({ data });
});

app.get('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .select()
    .from(mortgageTransactions)
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)));
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/transactions', async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const mortgageId = parseId(String(body.mortgageId));
  if (mortgageId === null) return c.json({ error: 'Invalid mortgage id' }, HTTP_STATUS.BAD_REQUEST);
  const [mortgage] = await db
    .select({ id: mortgages.id })
    .from(mortgages)
    .where(and(eq(mortgages.id, mortgageId), eq(mortgages.userId, user.id)));
  if (!mortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(mortgageTransactions)
    .values({ ...body, mortgageId, userId: user.id })
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
    .update(mortgageTransactions)
    .set(safeBody)
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .delete(mortgageTransactions)
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
