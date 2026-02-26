import { Hono } from "hono";
import { db } from "../db/client";
import { mortgages, mortgageTransactions, properties } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "../lib/authUser";

const app = new Hono();
const MAX_INT32 = 2_147_483_647;

function parseId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_INT32) return null;
  return parsed;
}

function parseOptionalId(value: unknown): number | null | "invalid" {
  if (value == null || value === "") return null;
  const parsed = parseId(String(value));
  if (parsed === null) return "invalid";
  return parsed;
}

type LinkedProperty = { id: number; address: string; currency: string; currentValue: unknown; mortgageId: number | null };

function resolveNextPropertyId(raw: unknown, currentId: number | null): { ok: true; id: number | null } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, id: currentId };
  const parsed = parseOptionalId(raw);
  if (parsed === "invalid") return { ok: false, error: "Invalid linkedPropertyId" };
  if (parsed === null) return { ok: false, error: "Mortgage must be linked to a property" };
  return { ok: true, id: parsed };
}

async function fetchLinkedProperty(userId: number, propertyId: number, mortgageId: number): Promise<{ ok: true; property: LinkedProperty } | { ok: false; error: string; status: 404 | 409 }> {
  const [property] = await db
    .select({ id: properties.id, address: properties.address, currency: properties.currency, currentValue: properties.currentValue, mortgageId: properties.mortgageId })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)));
  if (!property) return { ok: false, error: "Property not found", status: 404 };
  if (property.mortgageId != null && property.mortgageId !== mortgageId) {
    return { ok: false, error: "Property already has a linked mortgage", status: 409 };
  }
  return { ok: true, property };
}

async function syncLinkedProperty(userId: number, prevId: number | null, nextId: number | null, mortgageId: number, balance: unknown) {
  if (prevId != null && prevId !== nextId) {
    await db.update(properties).set({ mortgageId: null, mortgage: 0 } as any).where(and(eq(properties.id, prevId), eq(properties.userId, userId)));
  }
  if (nextId != null) {
    await db.update(properties).set({ mortgageId, mortgage: balance } as any).where(and(eq(properties.id, nextId), eq(properties.userId, userId)));
  }
}

// ── Mortgages ────────────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const user = getAuthUser(c);
  const data = await db.select().from(mortgages).where(eq(mortgages.userId, user.id));
  return c.json({ data });
});

app.get("/:id", async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid mortgage id" }, 400);
  const [data] = await db
    .select()
    .from(mortgages)
    .where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)));
  if (!data) return c.json({ error: "Mortgage not found" }, 404);
  return c.json({ data });
});

app.post("/", async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const { userId: _ignoredUserId, linkedPropertyId: rawLinkedPropertyId, ...safeBody } = body ?? {};
  const linkedPropertyId = parseId(String(rawLinkedPropertyId));
  if (linkedPropertyId === null) return c.json({ error: "linkedPropertyId is required" }, 400);

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
  if (!property) return c.json({ error: "Property not found" }, 404);
  if (property.mortgageId != null) return c.json({ error: "Property already has a linked mortgage" }, 409);

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

  return c.json({ data }, 201);
});

app.patch("/:id", async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid mortgage id" }, 400);
  const body = await c.req.json();
  const { userId: _ignoredUserId, linkedPropertyId: rawLinkedPropertyId, ...safeBody } = body ?? {};

  const [existingMortgage] = await db.select({ id: mortgages.id }).from(mortgages).where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)));
  if (!existingMortgage) return c.json({ error: "Mortgage not found" }, 404);

  const [currentLinkedProperty] = await db.select({ id: properties.id }).from(properties).where(and(eq(properties.userId, user.id), eq(properties.mortgageId, id)));

  const nextIdResult = resolveNextPropertyId(rawLinkedPropertyId, currentLinkedProperty?.id ?? null);
  if (!nextIdResult.ok) return c.json({ error: nextIdResult.error }, 400);
  const nextLinkedPropertyId = nextIdResult.id;

  let nextLinkedProperty: LinkedProperty | null = null;
  if (nextLinkedPropertyId != null) {
    const result = await fetchLinkedProperty(user.id, nextLinkedPropertyId, id);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    nextLinkedProperty = result.property;
  }

  const updates: Record<string, unknown> = { ...safeBody };
  if (nextLinkedProperty) {
    updates.propertyAddress = nextLinkedProperty.address;
    updates.currency = nextLinkedProperty.currency;
    if (updates.propertyValue === undefined) updates.propertyValue = nextLinkedProperty.currentValue;
  }

  const [data] = await db.update(mortgages).set(updates as any).where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id))).returning();
  if (!data) return c.json({ error: "Mortgage not found" }, 404);

  await syncLinkedProperty(user.id, currentLinkedProperty?.id ?? null, nextLinkedPropertyId, id, updates.outstandingBalance ?? data.outstandingBalance);
  return c.json({ data });
});

app.delete("/:id", async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid mortgage id" }, 400);

  await db
    .update(properties)
    .set({ mortgageId: null, mortgage: 0 } as any)
    .where(and(eq(properties.mortgageId, id), eq(properties.userId, user.id)));

  const [data] = await db
    .delete(mortgages)
    .where(and(eq(mortgages.id, id), eq(mortgages.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: "Mortgage not found" }, 404);
  return c.json({ data });
});

// ── Mortgage Transactions ────────────────────────────────────────────────────

app.get("/transactions", async (c) => {
  const user = getAuthUser(c);
  const mortgageId = c.req.query("mortgageId");
  if (mortgageId) {
    const parsedMortgageId = parseId(mortgageId);
    if (parsedMortgageId === null) return c.json({ error: "Invalid mortgage id" }, 400);
    const data = await db
      .select()
      .from(mortgageTransactions)
      .where(and(eq(mortgageTransactions.mortgageId, parsedMortgageId), eq(mortgageTransactions.userId, user.id)));
    return c.json({ data });
  }
  const data = await db.select().from(mortgageTransactions).where(eq(mortgageTransactions.userId, user.id));
  return c.json({ data });
});

app.get("/transactions/:id", async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid transaction id" }, 400);
  const [data] = await db
    .select()
    .from(mortgageTransactions)
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)));
  if (!data) return c.json({ error: "Transaction not found" }, 404);
  return c.json({ data });
});

app.post("/transactions", async (c) => {
  const user = getAuthUser(c);
  const body = await c.req.json();
  const mortgageId = parseId(String(body.mortgageId));
  if (mortgageId === null) return c.json({ error: "Invalid mortgage id" }, 400);
  const [mortgage] = await db
    .select({ id: mortgages.id })
    .from(mortgages)
    .where(and(eq(mortgages.id, mortgageId), eq(mortgages.userId, user.id)));
  if (!mortgage) return c.json({ error: "Mortgage not found" }, 404);

  const [data] = await db.insert(mortgageTransactions).values({ ...body, mortgageId, userId: user.id }).returning();
  return c.json({ data }, 201);
});

app.patch("/transactions/:id", async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid transaction id" }, 400);
  const body = await c.req.json();
  const { userId: _ignoredUserId, ...safeBody } = body ?? {};
  const [data] = await db
    .update(mortgageTransactions)
    .set(safeBody)
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: "Transaction not found" }, 404);
  return c.json({ data });
});

app.delete("/transactions/:id", async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid transaction id" }, 400);
  const [data] = await db
    .delete(mortgageTransactions)
    .where(and(eq(mortgageTransactions.id, id), eq(mortgageTransactions.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: "Transaction not found" }, 404);
  return c.json({ data });
});

export default app;
