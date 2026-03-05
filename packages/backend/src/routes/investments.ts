import { Hono } from 'hono';
import {
  parseTickerItemType,
  type TickerLookupExchange,
  type TickerLookupResult,
} from '@quro/shared';
import { db } from '../db/client';
import {
  holdings,
  holdingTransactions,
  mortgages,
  properties,
  propertyTransactions,
  stockExchanges,
} from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';
import { lookupTicker } from '../lib/marketstack';
import { syncHoldingPricesForUser, upsertHoldingPriceSnapshot } from '../lib/holdingPriceSync';

const app = new Hono();
const MAX_INT32 = 2_147_483_647;
const DATE_PART_LENGTH = 10;
const LOOKUP_TICKER_UNAVAILABLE_MESSAGE = 'Lookup Ticker feature is not available.';

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

function normalizeHoldingPayload(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const payload = { ...(body as Record<string, unknown>) };
  if (Object.prototype.hasOwnProperty.call(payload, 'itemType')) {
    const raw = payload.itemType;
    payload.itemType = parseTickerItemType(typeof raw === 'string' ? raw : null);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'priceUpdatedAt')) {
    const parsed = parseTimestamp(payload.priceUpdatedAt);
    payload.priceUpdatedAt = parsed;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'currentPrice')) {
    const normalized = toNormalizedDecimal(payload.currentPrice);
    if (normalized !== null) {
      payload.currentPrice = normalized;
    }
  }
  return payload;
}

type LookupPriceFields = Pick<
  TickerLookupResult,
  'currentPrice' | 'currency' | 'priceCurrency' | 'priceUpdatedAt' | 'eodDate'
>;

function buildLookupPriceFields(result: TickerLookupResult): LookupPriceFields {
  return {
    currentPrice: result.currentPrice ?? null,
    currency: result.currency ?? null,
    priceCurrency: result.priceCurrency ?? result.currency ?? null,
    priceUpdatedAt: result.priceUpdatedAt ?? null,
    eodDate: result.eodDate ?? null,
  };
}

function toDateOnly(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, DATE_PART_LENGTH);
}

function parseTimestamp(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toNormalizedDecimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');
  const compact = trimmed.replace(/\s+/g, '');
  let normalized = compact;

  if (hasComma && hasDot) {
    normalized =
      compact.lastIndexOf(',') > compact.lastIndexOf('.')
        ? compact.replaceAll('.', '').replace(',', '.')
        : compact.replaceAll(',', '');
  } else if (hasComma) {
    normalized = compact.replace(',', '.');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSnapshotEodDate(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const parsed = toDateOnly(candidate);
    if (parsed) return parsed;
  }
  return new Date().toISOString().slice(0, DATE_PART_LENGTH);
}

function resolveSnapshotPriceCurrency(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toUpperCase();
    if (normalized) return normalized;
  }
  return 'USD';
}

async function upsertStockExchangeReference(exchange: TickerLookupExchange | null): Promise<void> {
  if (!exchange) return;

  const existing = await db
    .select({ id: stockExchanges.id })
    .from(stockExchanges)
    .where(eq(stockExchanges.mic, exchange.mic));

  if (existing.length > 0) return;

  await db.insert(stockExchanges).values({
    mic: exchange.mic,
    name: exchange.name,
    acronym: exchange.acronym || null,
    country: exchange.country,
    countryCode: exchange.countryCode || null,
    city: exchange.city || null,
    website: exchange.website || null,
  });
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
  const body = normalizeHoldingPayload(await c.req.json());
  const {
    userId: _ignoredUserId,
    priceCurrency: rawPriceCurrency,
    eodDate: rawEodDate,
    ...insertPayload
  } = body ?? {};
  const [data] = await db
    .insert(holdings)
    .values({ ...insertPayload, userId: user.id } as any)
    .returning();

  try {
    await upsertHoldingPriceSnapshot({
      userId: user.id,
      holdingId: data.id,
      eodDate: resolveSnapshotEodDate(
        rawEodDate,
        insertPayload.priceUpdatedAt,
        data.priceUpdatedAt,
      ),
      closePrice: data.currentPrice,
      priceCurrency: resolveSnapshotPriceCurrency(
        rawPriceCurrency,
        insertPayload.currency,
        data.currency,
      ),
    });
  } catch (error) {
    console.warn('[Investments] Failed to save initial holding price snapshot', error);
  }

  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/holdings/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid holding id' }, HTTP_STATUS.BAD_REQUEST);
  const body = normalizeHoldingPayload(await c.req.json());
  const {
    userId: _ignoredUserId,
    priceCurrency: _ignoredPriceCurrency,
    eodDate: _ignoredEodDate,
    ...safeBody
  } = body ?? {};
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

// ── Ticker Lookup (Marketstack) ──────────────────────────────────────────────

app.get('/ticker-lookup/:symbol', async (c) => {
  const symbol = c.req.param('symbol');
  if (!symbol?.trim()) {
    return c.json({ error: 'Symbol is required' }, HTTP_STATUS.BAD_REQUEST);
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  try {
    const result = await lookupTicker(normalizedSymbol);
    const priceFields = buildLookupPriceFields(result);
    await upsertStockExchangeReference(result.exchange);

    return c.json({
      data: {
        ...result,
        ...priceFields,
      },
    });
  } catch (error) {
    console.warn('[Investments] Ticker lookup failed', {
      symbol: normalizedSymbol,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: LOOKUP_TICKER_UNAVAILABLE_MESSAGE }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
});

// ── Sync Holding Prices (Marketstack EOD) ────────────────────────────────────

app.post('/holdings/sync-prices', async (c) => {
  const user = getAuthUser(c);
  const syncOutcome = await syncHoldingPricesForUser(user.id);
  return c.json({ data: syncOutcome.summary });
});

// ── Refresh Holding Price (single holding) ───────────────────────────────────

app.post('/holdings/:id/refresh-price', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid holding id' }, HTTP_STATUS.BAD_REQUEST);

  const [holding] = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, id), eq(holdings.userId, user.id)));
  if (!holding) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);

  const syncOutcome = await syncHoldingPricesForUser(user.id, { holdingIds: [id] });
  const refreshed = syncOutcome.updates.find((entry) => entry.holding.id === id);
  if (!refreshed) {
    const reason =
      syncOutcome.summary.issues.find((issue) => issue.holdingId === id)?.reason ??
      `No valid EOD close price found for ticker: ${holding.ticker}`;
    return c.json({ error: reason }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  return c.json({
    data: refreshed.holding,
    price: refreshed.price,
    sync: syncOutcome.summary,
  });
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
