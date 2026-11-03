import { registerTransactionReadRoutes } from '../lib/transactionRoutes';
import { registerArchivableResource } from '../lib/archivableResource';
import { findOwnedRow } from '../lib/access';
import { Hono } from 'hono';
import {
  HOLDING_TRANSACTION_TYPES,
  MAX_RISK_CLASS,
  MIN_RISK_CLASS,
  isAssetClass,
  parseTickerItemType,
  type AssetClass,
  type CurrencyCode,
  type HoldingTransactionType,
  type TickerItemType,
  type TickerLookupExchange,
  type TickerLookupResult,
  toDateOnly,
  toDateOnlyOr,
  TEXT_FIELD_LIMITS,
} from '@quro/shared';
import { db, type DbTransaction } from '../db/client';
import { holdings, holdingPriceHistory, holdingTransactions, stockExchanges } from '../db/schema';
import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';

import { HTTP_STATUS } from '../constants/http';
import { lookupTicker } from '../lib/marketData';
import { syncHoldingPricesForUser, upsertHoldingPriceSnapshot } from '../lib/holdingPriceSync';
import { earliestDate } from '../lib/netWorth';
import { LEDGER_ROW_CHANGED, lockLedgerRow, withLedgerWrite } from '../lib/ledgerWrite';
import { parseListPageQuery, readListPage, type KeysetOrder } from '../lib/listPage';
import {
  err,
  type FieldParsers,
  isRecord,
  ok,
  parseCurrencyField,
  parseDateField,
  parseDateString,
  parseId,
  parseIntegerField,
  parseOptionalDateField,
  parseOptionalIntegerField,
  parseOptionalMoneyField,
  parseOptionalNormalizedDecimalField,
  parseOptionalTextField,
  parseOptionalUnitPriceField,
  parsePatchFields,
  parseRequiredFields,
  type ParseResult,
  parseTextField,
  checkTextLimits,
  parseUnitPriceField,
  readJsonBody,
  rejectUnknownFields,
  roundUnitPrice,
} from '../lib/requestValidation';
import { log, errorFields } from '../lib/logger';

const app = new Hono();

const LOOKUP_TICKER_UNAVAILABLE_MESSAGE = 'Lookup Ticker feature is not available.';

const HOLDING_FIELDS = [
  'name',
  'ticker',
  'currentPrice',
  'currency',
  'sector',
  'itemType',
  'exchangeMic',
  'industry',
  'priceUpdatedAt',
  'manualPrice',
  'excludeFromSync',
  'assetClass',
  'riskClassOverride',
] as const;

const HOLDING_CREATE_FIELDS = [...HOLDING_FIELDS, 'priceCurrency', 'eodDate'] as const;

const HOLDING_TRANSACTION_FIELDS = [
  'holdingId',
  'type',
  'shares',
  'price',
  'amount',
  'date',
  'note',
] as const;

function parseDateOnly(value: string | null): string | null {
  return parseDateString(value);
}

function parseHoldingIdsParam(value: string | null): number[] | null {
  if (!value || !value.trim()) return [];
  const rawIds = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (rawIds.length === 0) return [];

  const parsedIds: number[] = [];
  for (const rawId of rawIds) {
    const parsed = parseId(rawId);
    if (parsed === null) return null;
    parsedIds.push(parsed);
  }
  return [...new Set(parsedIds)];
}

type HoldingPriceHistoryQuery = {
  holdingIds: number[];
  from: string;
  to: string | null;
};

// (holding, day) is unique, so the holding id orders prices that share a day.
const PRICE_HISTORY_ORDER: KeysetOrder = {
  key: holdingPriceHistory.eodDate,
  keyType: 'date',
  tie: holdingPriceHistory.holdingId,
  direction: 'asc',
};

function parseHoldingPriceHistoryQuery(input: {
  rawHoldingIds: string | null;
  rawFrom: string | null;
  rawTo: string | null;
}): { value: HoldingPriceHistoryQuery } | { error: string } {
  const holdingIds = parseHoldingIdsParam(input.rawHoldingIds);
  if (holdingIds === null) {
    return { error: 'Invalid holdingIds query parameter. Use comma-separated positive integers.' };
  }

  if (!input.rawFrom) return { error: 'A from date is required. Use YYYY-MM-DD format.' };
  const from = parseDateOnly(input.rawFrom);
  const to = parseDateOnly(input.rawTo);
  if (!from) return { error: 'Invalid from date. Use YYYY-MM-DD format.' };
  if (input.rawTo && !to) return { error: 'Invalid to date. Use YYYY-MM-DD format.' };
  if (to && from > to) return { error: '`from` must be less than or equal to `to`.' };

  return {
    value: {
      holdingIds,
      from,
      to,
    },
  };
}

type HoldingPayload = {
  name: string;
  ticker: string;
  currentPrice: number;
  currency: CurrencyCode;
  sector: string;
  itemType: TickerItemType | null;
  exchangeMic: string | null;
  industry: string | null;
  priceUpdatedAt: Date | null;
  manualPrice: number | null;
  excludeFromSync: boolean;
  assetClass: AssetClass | null;
  riskClassOverride: number | null;
};

type HoldingCreatePayload = HoldingPayload & {
  priceCurrency: string | null;
  eodDate: string | null;
};

// A buy or sell has shares and a price per share; a dividend has an amount and neither.
type HoldingTransactionPayload = {
  holdingId: number;
  type: HoldingTransactionType;
  shares: number | null;
  price: number | null;
  amount: number | null;
  date: string;
  note: string | null;
};

function parseOptionalTimestampField(value: unknown, error: string): ParseResult<Date | null> {
  if (value == null || value === '') return ok(null);
  const parsed = parseTimestamp(value);
  return parsed ? ok(parsed) : err(error);
}

function parseHoldingItemTypeField(value: unknown): ParseResult<TickerItemType | null> {
  if (value == null || value === '') return ok(null);
  const parsed = parseTickerItemType(typeof value === 'string' ? value : null);
  return parsed ? ok(parsed) : err('Invalid holding item type');
}

function parseHoldingAssetClassField(value: unknown): ParseResult<AssetClass | null> {
  if (value == null || value === '') return ok(null);
  return isAssetClass(value) ? ok(value) : err('Invalid asset class');
}

function parseHoldingRiskClassField(value: unknown): ParseResult<number | null> {
  return parseOptionalIntegerField(
    value,
    `Risk class must be a whole number from ${MIN_RISK_CLASS} to ${MAX_RISK_CLASS}`,
    MIN_RISK_CLASS,
    MAX_RISK_CLASS,
  );
}

function parseHoldingTransactionTypeField(value: unknown): ParseResult<HoldingTransactionType> {
  return typeof value === 'string' &&
    HOLDING_TRANSACTION_TYPES.includes(value as HoldingTransactionType)
    ? ok(value as HoldingTransactionType)
    : err('Invalid holding transaction type');
}

const holdingParsers: FieldParsers<HoldingPayload> = {
  name: (value) => parseTextField(value, 'Holding name is required'),
  ticker: (value) => parseTextField(value, 'Ticker is required'),
  currentPrice: (value) => parseUnitPriceField(value, 'Current price must be zero or greater', 0),
  currency: parseCurrencyField,
  sector: (value) => parseTextField(value, 'Sector is required'),
  itemType: parseHoldingItemTypeField,
  exchangeMic: (value) => parseOptionalTextField(value, 'Exchange MIC must be a string'),
  industry: (value) => parseOptionalTextField(value, 'Industry must be a string'),
  priceUpdatedAt: (value) => parseOptionalTimestampField(value, 'Invalid priceUpdatedAt timestamp'),
  manualPrice: (value) =>
    parseOptionalUnitPriceField(value, 'Manual price must be a valid number', 0),
  excludeFromSync: (value) =>
    value === undefined || typeof value === 'boolean'
      ? ok(value ?? false)
      : err('excludeFromSync must be a boolean'),
  assetClass: parseHoldingAssetClassField,
  riskClassOverride: parseHoldingRiskClassField,
};

const holdingTransactionParsers: FieldParsers<HoldingTransactionPayload> = {
  holdingId: (value) => parseIntegerField(value, 'Invalid holding id', 1),
  type: parseHoldingTransactionTypeField,
  shares: (value) =>
    parseOptionalNormalizedDecimalField(
      value,
      'Shares must be greater than zero',
      Number.MIN_VALUE,
    ),
  // A unit price, rounded to six decimals once the type is known (`roundTransactionPrice`).
  price: (value) =>
    parseOptionalNormalizedDecimalField(value, 'Price must be greater than zero', Number.MIN_VALUE),
  // The amount a dividend paid: money, so the money input rule rounds it to cents and bounds it.
  amount: (value) =>
    parseOptionalMoneyField(value, {
      field: 'amount',
      error: 'Dividend amount must be greater than zero',
      min: Number.MIN_VALUE,
    }),
  date: (value) => parseDateField(value, 'Transaction date must be a valid ISO date'),
  note: (value) => parseOptionalTextField(value, 'Transaction note must be a string'),
};

export function parseHoldingCreate(body: unknown): ParseResult<HoldingCreatePayload> {
  if (!isRecord(body)) return err('Invalid holding payload');
  const strictCheck = rejectUnknownFields(body, HOLDING_CREATE_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body, holdingParsers);
  if (!parsed.ok) return parsed;

  const priceCurrency = parseOptionalTextField(
    body.priceCurrency,
    'Price currency must be a string',
  );
  if (!priceCurrency.ok) return priceCurrency;
  const eodDate = parseOptionalDateField(body.eodDate, 'Snapshot date must be a valid ISO date');
  if (!eodDate.ok) return eodDate;

  return ok({
    ...parsed.value,
    priceCurrency: priceCurrency.value,
    eodDate: eodDate.value,
  });
}

function parseHoldingPatch(body: unknown): ParseResult<Partial<HoldingPayload>> {
  if (!isRecord(body)) return err('Invalid holding payload');
  const strictCheck = rejectUnknownFields(body, HOLDING_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, holdingParsers);
}

export function parseHoldingTransactionCreate(
  body: unknown,
): ParseResult<HoldingTransactionPayload> {
  if (!isRecord(body)) return err('Invalid holding transaction payload');
  const strictCheck = rejectUnknownFields(body, HOLDING_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body, holdingTransactionParsers);
  if (!parsed.ok) return parsed;
  const validationError = validateHoldingTransactionPayload(parsed.value);
  return validationError ? err(validationError) : roundTransactionPrice(parsed.value);
}

// A buy or sell carries a price per share, a unit price kept to six decimals. A dividend's
// amount was rounded to cents when it was parsed.
function roundTransactionPrice(
  payload: HoldingTransactionPayload,
): ParseResult<HoldingTransactionPayload> {
  if (payload.type === 'dividend') return ok(payload);
  const price = roundUnitPrice(payload.price ?? 0);
  return price > 0 ? ok({ ...payload, price }) : err('Price must be greater than zero');
}

function parseHoldingTransactionPatch(
  body: unknown,
): ParseResult<Partial<HoldingTransactionPayload>> {
  if (!isRecord(body)) return err('Invalid holding transaction payload');
  const strictCheck = rejectUnknownFields(body, HOLDING_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, holdingTransactionParsers);
}

function validateHoldingTransactionPayload(payload: HoldingTransactionPayload): string | null {
  if (payload.type === 'dividend') {
    if (payload.shares != null) return 'Dividend transactions cannot include shares';
    if (payload.price != null) return 'A dividend records its amount in amount, not a price';
    return payload.amount == null ? 'Dividend amount must be greater than zero' : null;
  }
  if (payload.amount != null) return 'Only a dividend has an amount; a buy or sell has a price';
  if (payload.price == null) return 'Price must be greater than zero';
  return payload.shares != null && payload.shares > 0 ? null : 'Shares must be greater than zero';
}

// A field the patch leaves out keeps its stored value, except that a change of type does not carry
// a buy's price into a dividend or a dividend's amount into a buy: the patch supplies the new one.
function mergeHoldingTransactionPayload(
  patch: Partial<HoldingTransactionPayload>,
  existing: typeof holdingTransactions.$inferSelect,
): ParseResult<HoldingTransactionPayload> {
  const type = patch.type ?? existing.type;
  const dividend = type === 'dividend';
  return parseHoldingTransactionCreate({
    holdingId: patch.holdingId ?? existing.holdingId,
    type,
    shares: patch.shares === undefined ? existing.shares : patch.shares,
    price: patch.price === undefined ? (dividend ? null : existing.price) : patch.price,
    amount: patch.amount === undefined ? (dividend ? existing.amount : null) : patch.amount,
    date: patch.date ?? existing.date,
    note: patch.note === undefined ? existing.note : patch.note,
  });
}

function toHoldingInsertValues(
  payload: HoldingPayload,
  userId: number,
): typeof holdings.$inferInsert {
  return {
    userId,
    name: payload.name,
    ticker: payload.ticker,
    currentPrice: payload.currentPrice,
    currency: payload.currency,
    sector: payload.sector,
    itemType: payload.itemType,
    exchangeMic: payload.exchangeMic,
    industry: payload.industry,
    priceUpdatedAt: payload.priceUpdatedAt,
    manualPrice: payload.manualPrice ?? null,
    excludeFromSync: payload.excludeFromSync,
    assetClass: payload.assetClass,
    riskClassOverride: payload.riskClassOverride,
  };
}

function toHoldingUpdateValues(
  payload: Partial<HoldingPayload>,
): Partial<typeof holdings.$inferInsert> {
  return {
    name: payload.name,
    ticker: payload.ticker,
    currentPrice: payload.currentPrice,
    currency: payload.currency,
    sector: payload.sector,
    itemType: payload.itemType,
    exchangeMic: payload.exchangeMic,
    industry: payload.industry,
    priceUpdatedAt: payload.priceUpdatedAt,
    manualPrice: payload.manualPrice === undefined ? undefined : (payload.manualPrice ?? null),
    excludeFromSync: payload.excludeFromSync,
    assetClass: payload.assetClass,
    riskClassOverride: payload.riskClassOverride,
  };
}

function toHoldingTransactionInsertValues(
  payload: HoldingTransactionPayload,
  userId: number,
): typeof holdingTransactions.$inferInsert {
  return {
    userId,
    holdingId: payload.holdingId,
    type: payload.type,
    shares: payload.shares ?? null,
    price: payload.price,
    amount: payload.amount,
    date: payload.date,
    note: payload.note,
  };
}

function toHoldingTransactionUpdateValues(
  payload: HoldingTransactionPayload,
): Partial<typeof holdingTransactions.$inferInsert> {
  return {
    holdingId: payload.holdingId,
    type: payload.type,
    shares: payload.shares ?? null,
    price: payload.price,
    amount: payload.amount,
    date: payload.date,
    note: payload.note,
  };
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

function parseTimestamp(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseHoldingIdsBody(body: unknown): ParseResult<number[] | undefined> {
  if (!isRecord(body)) return err('Invalid holdingIds payload');
  const strictCheck = rejectUnknownFields(body, ['holdingIds']);
  if (!strictCheck.ok) return strictCheck;
  if (body.holdingIds === undefined) return ok(undefined);
  if (!Array.isArray(body.holdingIds)) return err('Invalid holdingIds payload');

  const parsedIds: number[] = [];
  for (const rawId of body.holdingIds) {
    const parsed = parseId(String(rawId));
    if (parsed === null) return err('Invalid holdingIds payload');
    parsedIds.push(parsed);
  }
  return ok([...new Set(parsedIds)]);
}

function resolveSnapshotEodDate(...candidates: (Date | string | null | undefined)[]): string {
  return toDateOnlyOr(candidates.find((candidate) => toDateOnly(candidate)));
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
  const includeArchived = c.req.query('includeArchived') === 'true';
  const data = await db
    .select()
    .from(holdings)
    .where(
      includeArchived
        ? eq(holdings.userId, user.id)
        : and(eq(holdings.userId, user.id), isNull(holdings.archivedAt)),
    )
    .orderBy(asc(holdings.id));
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
  const rawBody = await readJsonBody(c.req, 'Invalid holding payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseHoldingCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const lengths = await checkTextLimits(body.value, TEXT_FIELD_LIMITS.holding);
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

  const { priceCurrency: rawPriceCurrency, eodDate: rawEodDate, ...insertPayload } = body.value;
  const [data] = await db
    .insert(holdings)
    .values(toHoldingInsertValues(insertPayload, user.id))
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
    log.warn('investments.initial_snapshot_failed', errorFields(error));
  }

  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/holdings/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid holding id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid holding payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseHoldingPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No holding fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }
  const lengths = await checkTextLimits(body.value, TEXT_FIELD_LIMITS.holding, () =>
    findOwnedRow(holdings, id, user.id),
  );
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .update(holdings)
    .set(toHoldingUpdateValues(body.value))
    .where(and(eq(holdings.id, id), eq(holdings.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

registerArchivableResource(app, {
  path: '/holdings',
  table: holdings,
  label: 'Holding',
  idLabel: 'holding',
});

app.get('/holding-price-history', async (c) => {
  const user = getAuthUser(c);
  const parsedQuery = parseHoldingPriceHistoryQuery({
    rawHoldingIds: c.req.query('holdingIds') ?? null,
    rawFrom: c.req.query('from') ?? null,
    rawTo: c.req.query('to') ?? null,
  });
  if ('error' in parsedQuery) return c.json({ error: parsedQuery.error }, HTTP_STATUS.BAD_REQUEST);
  const { holdingIds, from, to } = parsedQuery.value;
  const pageRequest = parseListPageQuery(c.req, PRICE_HISTORY_ORDER.keyType);
  if (!pageRequest.ok) return c.json({ error: pageRequest.error }, HTTP_STATUS.BAD_REQUEST);

  const conditions = [
    eq(holdingPriceHistory.userId, user.id),
    gte(holdingPriceHistory.eodDate, from),
  ];
  if (holdingIds.length > 0) conditions.push(inArray(holdingPriceHistory.holdingId, holdingIds));
  if (to) conditions.push(lte(holdingPriceHistory.eodDate, to));

  const page = await readListPage(
    pageRequest.value,
    PRICE_HISTORY_ORDER,
    (window) =>
      db
        .select()
        .from(holdingPriceHistory)
        .where(and(...conditions, window.where))
        .orderBy(...window.orderBy)
        .limit(window.limit),
    (row) => ({ key: row.eodDate, tie: row.holdingId }),
  );
  return c.json(page);
});

// ── Ticker Lookup ────────────────────────────────────────────────────────────

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
    log.warn('investments.ticker_lookup_failed', {
      symbol: normalizedSymbol,
      ...errorFields(error),
    });
    return c.json({ error: LOOKUP_TICKER_UNAVAILABLE_MESSAGE }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
});

// ── Sync Holding Prices ───────────────────────────────────────────────────────

app.post('/holdings/sync-prices', async (c) => {
  const user = getAuthUser(c);
  const hasBody =
    (c.req.header('content-length') ?? '0') !== '0' ||
    c.req.header('content-type')?.includes('application/json') === true;
  const bodyResult = hasBody ? await readJsonBody(c.req, 'Invalid holdingIds payload') : ok({});
  if (!bodyResult.ok) return c.json({ error: bodyResult.error }, HTTP_STATUS.BAD_REQUEST);
  const holdingIds = parseHoldingIdsBody(bodyResult.value);
  if (!holdingIds.ok) return c.json({ error: holdingIds.error }, HTTP_STATUS.BAD_REQUEST);

  const syncOutcome = await syncHoldingPricesForUser(
    user.id,
    holdingIds.value ? { holdingIds: holdingIds.value } : undefined,
  );
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

registerTransactionReadRoutes(app, {
  path: '/holding-transactions',
  table: holdingTransactions,
  parent: holdings,
  parentId: holdingTransactions.holdingId,
  parentQuery: 'holdingId',
  parentLabel: 'Holding',
  parentIdLabel: 'holding',
  checkParent: false,
  emptyParentIsAbsent: true,
  scopeByChildOwner: true,
});

const HOLDING_GONE = { error: 'Holding not found', status: HTTP_STATUS.NOT_FOUND } as const;
const TRANSACTION_GONE = { error: 'Transaction not found', status: HTTP_STATUS.NOT_FOUND } as const;
const ROW_MOVED = { error: LEDGER_ROW_CHANGED, status: HTTP_STATUS.CONFLICT } as const;

/**
 * Locks the holdings in ascending id order, before any of their ledger rows; false when one is
 * gone or not the user's. A key-share lock, the one the foreign key takes: it waits for a cascade
 * archive that deletes the holding, but not for a price sync that only updates its price, so a
 * write and a sync of several holdings never wait for each other in opposite orders.
 */
async function lockOwnedHoldings(
  tx: DbTransaction,
  ids: readonly number[],
  userId: number,
): Promise<boolean> {
  const unique = [...new Set(ids)].sort((left, right) => left - right);
  const locked = await tx
    .select({ id: holdings.id, userId: holdings.userId })
    .from(holdings)
    .where(inArray(holdings.id, unique))
    .orderBy(asc(holdings.id))
    .for('key share');
  return unique.length === locked.length && locked.every((row) => row.userId === userId);
}

app.post('/holding-transactions', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid holding transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseHoldingTransactionCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const lengths = await checkTextLimits(body.value, TEXT_FIELD_LIMITS.holdingTransaction);
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

  const holding = await findOwnedRow(holdings, body.value.holdingId, user.id);
  if (!holding) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);

  const data = await db.transaction(async (tx) => {
    // The holding before its ledger row, in the order a cascade archive uses: a holding deleted
    // in the meantime has nothing left to add to.
    if (!(await lockOwnedHoldings(tx, [body.value.holdingId], user.id))) return null;
    const [created] = await tx
      .insert(holdingTransactions)
      .values(toHoldingTransactionInsertValues(body.value, user.id))
      .returning();
    await withLedgerWrite(tx, { userId: user.id }, body.value.date);
    return created;
  });
  if (!data) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/holding-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const existing = await findOwnedRow(holdingTransactions, id, user.id);
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const rawBody = await readJsonBody(c.req, 'Invalid holding transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseHoldingTransactionPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No holding transaction fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }
  const lengths = await checkTextLimits(body.value, TEXT_FIELD_LIMITS.holdingTransaction, existing);
  if (!lengths.ok) return c.json({ error: lengths.error }, HTTP_STATUS.BAD_REQUEST);

  const merged = mergeHoldingTransactionPayload(body.value, existing);
  if (!merged.ok) return c.json({ error: merged.error }, HTTP_STATUS.BAD_REQUEST);

  const holding = await findOwnedRow(holdings, merged.value.holdingId, user.id);
  if (!holding) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);

  const result = await db.transaction(async (tx) => {
    // Both holdings (the old and, on a move, the new one) before the row, in ascending id order as
    // a cascade archive takes them; then the row, whose committed values the edit applies to.
    const holdingIds = [existing.holdingId, merged.value.holdingId];
    if (!(await lockOwnedHoldings(tx, holdingIds, user.id))) return HOLDING_GONE;
    const previous = await lockLedgerRow(tx, holdingTransactions, id);
    if (!previous || previous.userId !== user.id) return TRANSACTION_GONE;
    if (previous.holdingId !== existing.holdingId) return ROW_MOVED;
    const next = mergeHoldingTransactionPayload(body.value, previous);
    if (!next.ok) return { error: next.error, status: HTTP_STATUS.BAD_REQUEST } as const;
    const [updated] = await tx
      .update(holdingTransactions)
      .set(toHoldingTransactionUpdateValues(next.value))
      .where(eq(holdingTransactions.id, id))
      .returning();
    await withLedgerWrite(tx, { userId: user.id }, earliestDate(previous.date, next.value.date));
    return { data: updated };
  });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});

app.delete('/holding-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);
  const existing = await findOwnedRow(holdingTransactions, id, user.id);
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);
  const result = await db.transaction(async (tx) => {
    // The holding before the row, as on create and edit.
    if (!(await lockOwnedHoldings(tx, [existing.holdingId], user.id))) return TRANSACTION_GONE;
    const [deleted] = await tx
      .delete(holdingTransactions)
      .where(
        and(
          eq(holdingTransactions.id, id),
          eq(holdingTransactions.userId, user.id),
          eq(holdingTransactions.holdingId, existing.holdingId),
        ),
      )
      .returning();
    if (deleted) {
      await withLedgerWrite(tx, { userId: user.id }, deleted.date);
      return { data: deleted };
    }
    // Gone, or moved to another holding since it was read.
    return (await findOwnedRow(holdingTransactions, id, user.id, tx))
      ? ROW_MOVED
      : TRANSACTION_GONE;
  });
  if ('error' in result) return c.json({ error: result.error }, result.status);
  return c.json({ data: result.data });
});
export default app;
