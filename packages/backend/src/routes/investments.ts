import { Hono } from 'hono';
import {
  parseTickerItemType,
  type CurrencyCode,
  type TickerItemType,
  type TickerLookupExchange,
  type TickerLookupResult,
} from '@quro/shared';
import { db } from '../db/client';
import {
  holdings,
  holdingPriceHistory,
  holdingTransactions,
  mortgages,
  properties,
  propertyTransactions,
  stockExchanges,
} from '../db/schema';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { getAuthUser } from '../lib/authUser';
import { HTTP_STATUS } from '../constants/http';
import { lookupTicker } from '../lib/marketstack';
import { syncHoldingPricesForUser, upsertHoldingPriceSnapshot } from '../lib/holdingPriceSync';
import {
  err,
  isRecord,
  ok,
  parseCurrencyField,
  parseDateField,
  parseDateString,
  parseId,
  parseIntegerField,
  parseOptionalTextField,
  parsePatchFields,
  parseRequiredFields,
  parseTextField,
  readJsonBody,
  rejectUnknownFields,
  type FieldParsers,
  type ParseResult,
} from '../lib/requestValidation';

const app = new Hono();
const DATE_PART_LENGTH = 10;
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
] as const;
const HOLDING_CREATE_FIELDS = [...HOLDING_FIELDS, 'priceCurrency', 'eodDate'] as const;
const HOLDING_TRANSACTION_FIELDS = [
  'holdingId',
  'type',
  'shares',
  'price',
  'date',
  'note',
] as const;
const PROPERTY_FIELDS = [
  'address',
  'propertyType',
  'purchasePrice',
  'currentValue',
  'mortgage',
  'mortgageId',
  'monthlyRent',
  'currency',
  'emoji',
] as const;
const PROPERTY_TRANSACTION_FIELDS = [
  'propertyId',
  'type',
  'amount',
  'interest',
  'principal',
  'date',
  'note',
] as const;
const HOLDING_TRANSACTION_TYPES = ['buy', 'sell', 'dividend'] as const;
const PROPERTY_TRANSACTION_TYPES = ['repayment', 'valuation', 'rent_income', 'expense'] as const;
const INVESTMENT_PROPERTY_TYPE_KEYS = new Set([
  'buy-to-let',
  'investment',
  'holiday home',
  'commercial',
  'rental',
]);

function parseOptionalId(value: unknown): number | null | 'invalid' {
  if (value == null || value === '') return null;
  const parsed = parseId(String(value));
  if (parsed === null) return 'invalid';
  return parsed;
}

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

function pickPatchedValue<T>(patchValue: T | undefined, existingValue: T): T {
  return patchValue === undefined ? existingValue : patchValue;
}

type HoldingPriceHistoryQuery = {
  holdingIds: number[];
  from: string | null;
  to: string | null;
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

  const from = parseDateOnly(input.rawFrom);
  const to = parseDateOnly(input.rawTo);
  if (input.rawFrom && !from) return { error: 'Invalid from date. Use YYYY-MM-DD format.' };
  if (input.rawTo && !to) return { error: 'Invalid to date. Use YYYY-MM-DD format.' };
  if (from && to && from > to) return { error: '`from` must be less than or equal to `to`.' };

  return {
    value: {
      holdingIds,
      from,
      to,
    },
  };
}

type HoldingTransactionType = (typeof HOLDING_TRANSACTION_TYPES)[number];
type PropertyTransactionType = (typeof PROPERTY_TRANSACTION_TYPES)[number];

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
};

type HoldingCreatePayload = HoldingPayload & {
  priceCurrency: string | null;
  eodDate: string | null;
};

type HoldingTransactionPayload = {
  holdingId: number;
  type: HoldingTransactionType;
  shares: number | null;
  price: number;
  date: string;
  note: string | null;
};

type PropertyPayload = {
  address: string;
  propertyType: string;
  purchasePrice: number;
  currentValue: number;
  mortgage: number;
  mortgageId: number | null;
  monthlyRent: number;
  currency: CurrencyCode;
  emoji: string | null;
};

type PropertyTransactionPayload = {
  propertyId: number;
  type: PropertyTransactionType;
  amount: number;
  interest: number | null;
  principal: number | null;
  date: string;
  note: string | null;
};

type PropertyCreateRequiredPayload = Omit<PropertyPayload, 'mortgage' | 'mortgageId' | 'emoji'>;

function parseNormalizedDecimalField(
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<number> {
  const parsed = toNormalizedDecimal(value);
  return parsed === null || parsed < min ? err(error) : ok(parsed);
}

function parseOptionalNormalizedDecimalField(
  value: unknown,
  error: string,
  min = Number.NEGATIVE_INFINITY,
): ParseResult<number | null> {
  if (value == null || value === '') return ok(null);
  const parsed = toNormalizedDecimal(value);
  return parsed === null || parsed < min ? err(error) : ok(parsed);
}

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

function parseHoldingTransactionTypeField(value: unknown): ParseResult<HoldingTransactionType> {
  return typeof value === 'string' &&
    HOLDING_TRANSACTION_TYPES.includes(value as HoldingTransactionType)
    ? ok(value as HoldingTransactionType)
    : err('Invalid holding transaction type');
}

function parsePropertyTransactionTypeField(value: unknown): ParseResult<PropertyTransactionType> {
  return typeof value === 'string' &&
    PROPERTY_TRANSACTION_TYPES.includes(value as PropertyTransactionType)
    ? ok(value as PropertyTransactionType)
    : err('Invalid property transaction type');
}

const holdingParsers: FieldParsers<HoldingPayload> = {
  name: (value) => parseTextField(value, 'Holding name is required'),
  ticker: (value) => parseTextField(value, 'Ticker is required'),
  currentPrice: (value) =>
    parseNormalizedDecimalField(value, 'Current price must be zero or greater', 0),
  currency: parseCurrencyField,
  sector: (value) => parseTextField(value, 'Sector is required'),
  itemType: parseHoldingItemTypeField,
  exchangeMic: (value) => parseOptionalTextField(value, 'Exchange MIC must be a string'),
  industry: (value) => parseOptionalTextField(value, 'Industry must be a string'),
  priceUpdatedAt: (value) => parseOptionalTimestampField(value, 'Invalid priceUpdatedAt timestamp'),
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
  price: (value) =>
    parseNormalizedDecimalField(value, 'Price must be greater than zero', Number.MIN_VALUE),
  date: (value) => parseDateField(value, 'Transaction date must be a valid ISO date'),
  note: (value) => parseOptionalTextField(value, 'Transaction note must be a string'),
};

const propertyParsers: FieldParsers<PropertyPayload> = {
  address: (value) => parseTextField(value, 'Property address is required'),
  propertyType: (value) => parseTextField(value, 'Property type is required'),
  purchasePrice: (value) =>
    parseNormalizedDecimalField(
      value,
      'Purchase price must be greater than zero',
      Number.MIN_VALUE,
    ),
  currentValue: (value) =>
    parseNormalizedDecimalField(value, 'Current value must be greater than zero', Number.MIN_VALUE),
  mortgage: (value) =>
    parseNormalizedDecimalField(value, 'Mortgage balance must be zero or greater', 0),
  mortgageId: (value) => {
    const parsed = parseOptionalId(value);
    return parsed === 'invalid' ? err('Invalid mortgage id') : ok(parsed);
  },
  monthlyRent: (value) =>
    parseNormalizedDecimalField(value, 'Monthly rent must be zero or greater', 0),
  currency: parseCurrencyField,
  emoji: (value) => parseOptionalTextField(value, 'Emoji must be a string'),
};

const propertyCreateRequiredParsers: FieldParsers<PropertyCreateRequiredPayload> = {
  address: propertyParsers.address,
  propertyType: propertyParsers.propertyType,
  purchasePrice: propertyParsers.purchasePrice,
  currentValue: propertyParsers.currentValue,
  monthlyRent: propertyParsers.monthlyRent,
  currency: propertyParsers.currency,
};

const propertyTransactionParsers: FieldParsers<PropertyTransactionPayload> = {
  propertyId: (value) => parseIntegerField(value, 'Invalid property id', 1),
  type: parsePropertyTransactionTypeField,
  amount: (value) =>
    parseNormalizedDecimalField(value, 'Amount must be greater than zero', Number.MIN_VALUE),
  interest: (value) =>
    parseOptionalNormalizedDecimalField(value, 'Interest must be zero or greater', 0),
  principal: (value) =>
    parseOptionalNormalizedDecimalField(value, 'Principal must be zero or greater', 0),
  date: (value) => parseDateField(value, 'Transaction date must be a valid ISO date'),
  note: (value) => parseOptionalTextField(value, 'Transaction note must be a string'),
};

function parseHoldingCreate(body: unknown): ParseResult<HoldingCreatePayload> {
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

function parseOptionalDateField(value: unknown, error: string): ParseResult<string | null> {
  if (value == null || value === '') return ok(null);
  const parsed = parseDateString(value);
  return parsed ? ok(parsed) : err(error);
}

function parseHoldingPatch(body: unknown): ParseResult<Partial<HoldingPayload>> {
  if (!isRecord(body)) return err('Invalid holding payload');
  const strictCheck = rejectUnknownFields(body, HOLDING_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, holdingParsers);
}

function parseHoldingTransactionCreate(body: unknown): ParseResult<HoldingTransactionPayload> {
  if (!isRecord(body)) return err('Invalid holding transaction payload');
  const strictCheck = rejectUnknownFields(body, HOLDING_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body, holdingTransactionParsers);
  if (!parsed.ok) return parsed;
  const validationError = validateHoldingTransactionPayload(parsed.value);
  return validationError ? err(validationError) : parsed;
}

function parseHoldingTransactionPatch(
  body: unknown,
): ParseResult<Partial<HoldingTransactionPayload>> {
  if (!isRecord(body)) return err('Invalid holding transaction payload');
  const strictCheck = rejectUnknownFields(body, HOLDING_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, holdingTransactionParsers);
}

function parsePropertyCreate(body: unknown): ParseResult<PropertyPayload> {
  if (!isRecord(body)) return err('Invalid property payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  const required = parseRequiredFields(body, propertyCreateRequiredParsers);
  if (!required.ok) return required;
  const mortgage = propertyParsers.mortgage(body.mortgage ?? 0);
  if (!mortgage.ok) return mortgage;
  const mortgageId = propertyParsers.mortgageId(body.mortgageId);
  if (!mortgageId.ok) return mortgageId;
  const emoji = propertyParsers.emoji(body.emoji);
  if (!emoji.ok) return emoji;

  return ok({
    ...required.value,
    mortgage: mortgage.value,
    mortgageId: mortgageId.value,
    emoji: emoji.value,
  });
}

function parsePropertyPatch(body: unknown): ParseResult<Partial<PropertyPayload>> {
  if (!isRecord(body)) return err('Invalid property payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, propertyParsers);
}

function parsePropertyTransactionCreate(body: unknown): ParseResult<PropertyTransactionPayload> {
  if (!isRecord(body)) return err('Invalid property transaction payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;

  const parsed = parseRequiredFields(body, propertyTransactionParsers);
  if (!parsed.ok) return parsed;
  return ok(normalizePropertyTransactionPayload(parsed.value));
}

function parsePropertyTransactionPatch(
  body: unknown,
): ParseResult<Partial<PropertyTransactionPayload>> {
  if (!isRecord(body)) return err('Invalid property transaction payload');
  const strictCheck = rejectUnknownFields(body, PROPERTY_TRANSACTION_FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body, propertyTransactionParsers);
}

function validateHoldingTransactionPayload(payload: HoldingTransactionPayload): string | null {
  if (payload.type === 'dividend') {
    return payload.shares == null ? null : 'Dividend transactions cannot include shares';
  }

  return payload.shares != null && payload.shares > 0 ? null : 'Shares must be greater than zero';
}

function normalizePropertyTransactionPayload(
  payload: PropertyTransactionPayload,
): PropertyTransactionPayload {
  if (payload.type === 'repayment') {
    const interest = payload.interest ?? 0;
    const principal = payload.principal ?? Number((payload.amount - interest).toFixed(2));
    return { ...payload, interest, principal };
  }

  return {
    ...payload,
    interest: null,
    principal: null,
  };
}

function validateRepaymentBreakdown(
  amount: number,
  interest: number,
  principal: number,
): string | null {
  if (interest > amount) return 'Interest cannot exceed the total repayment amount';
  if (principal > amount) return 'Principal cannot exceed the total repayment amount';
  if (Math.abs(interest + principal - amount) > 0.01) {
    return 'Interest and principal must add up to the total repayment amount';
  }
  return null;
}

function validatePropertyRepaymentPayload(
  payload: PropertyTransactionPayload,
  property: typeof properties.$inferSelect,
): string | null {
  if ((toNormalizedDecimal(property.mortgage) ?? 0) <= 0 && property.mortgageId == null) {
    return 'Property is not linked to a mortgage';
  }

  return validateRepaymentBreakdown(payload.amount, payload.interest ?? 0, payload.principal ?? 0);
}

function isRentOrExpenseTransaction(type: PropertyTransactionType): boolean {
  return type === 'rent_income' || type === 'expense';
}

function validatePropertyTransactionPayload(
  payload: PropertyTransactionPayload,
  property: typeof properties.$inferSelect,
): string | null {
  if (payload.type === 'repayment') return validatePropertyRepaymentPayload(payload, property);
  if (
    isRentOrExpenseTransaction(payload.type) &&
    !isInvestmentPropertyType(property.propertyType)
  ) {
    return 'Rent and expense transactions are only supported for investment properties';
  }

  return null;
}

function mergeHoldingTransactionPayload(
  patch: Partial<HoldingTransactionPayload>,
  existing: typeof holdingTransactions.$inferSelect,
): ParseResult<HoldingTransactionPayload> {
  return parseHoldingTransactionCreate({
    holdingId: patch.holdingId ?? existing.holdingId,
    type: patch.type ?? existing.type,
    shares: patch.shares === undefined ? existing.shares : patch.shares,
    price: patch.price ?? existing.price,
    date: patch.date ?? existing.date,
    note: patch.note === undefined ? existing.note : patch.note,
  });
}

function mergePropertyTransactionPayload(
  patch: Partial<PropertyTransactionPayload>,
  existing: typeof propertyTransactions.$inferSelect,
): ParseResult<PropertyTransactionPayload> {
  return parsePropertyTransactionCreate({
    propertyId: patch.propertyId ?? existing.propertyId,
    type: patch.type ?? existing.type,
    amount: patch.amount ?? existing.amount,
    interest: patch.interest === undefined ? existing.interest : patch.interest,
    principal: patch.principal === undefined ? existing.principal : patch.principal,
    date: patch.date ?? existing.date,
    note: patch.note === undefined ? existing.note : patch.note,
  });
}

function isInvestmentPropertyType(value: string): boolean {
  return INVESTMENT_PROPERTY_TYPE_KEYS.has(value.trim().toLowerCase());
}

function toHoldingInsertValues(
  payload: HoldingPayload,
  userId: number,
): typeof holdings.$inferInsert {
  return {
    userId,
    name: payload.name,
    ticker: payload.ticker,
    currentPrice: payload.currentPrice.toString(),
    currency: payload.currency,
    sector: payload.sector,
    itemType: payload.itemType,
    exchangeMic: payload.exchangeMic,
    industry: payload.industry,
    priceUpdatedAt: payload.priceUpdatedAt,
  };
}

function toHoldingUpdateValues(
  payload: Partial<HoldingPayload>,
): Partial<typeof holdings.$inferInsert> {
  return {
    name: payload.name,
    ticker: payload.ticker,
    currentPrice: payload.currentPrice?.toString(),
    currency: payload.currency,
    sector: payload.sector,
    itemType: payload.itemType,
    exchangeMic: payload.exchangeMic,
    industry: payload.industry,
    priceUpdatedAt: payload.priceUpdatedAt,
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
    shares: payload.shares?.toString() ?? null,
    price: payload.price.toString(),
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
    shares: payload.shares?.toString() ?? null,
    price: payload.price.toString(),
    date: payload.date,
    note: payload.note,
  };
}

function toPropertyInsertValues(
  payload: PropertyPayload,
  userId: number,
): typeof properties.$inferInsert {
  return {
    userId,
    address: payload.address,
    propertyType: payload.propertyType,
    purchasePrice: payload.purchasePrice.toString(),
    currentValue: payload.currentValue.toString(),
    mortgage: payload.mortgage.toString(),
    mortgageId: payload.mortgageId,
    monthlyRent: payload.monthlyRent.toString(),
    currency: payload.currency,
    emoji: payload.emoji,
  };
}

function toPropertyUpdateValues(
  payload: Partial<PropertyPayload>,
): Partial<typeof properties.$inferInsert> {
  return {
    address: payload.address,
    propertyType: payload.propertyType,
    purchasePrice: payload.purchasePrice?.toString(),
    currentValue: payload.currentValue?.toString(),
    mortgage: payload.mortgage?.toString(),
    mortgageId: payload.mortgageId,
    monthlyRent: payload.monthlyRent?.toString(),
    currency: payload.currency,
    emoji: payload.emoji,
  };
}

function toPropertyTransactionInsertValues(
  payload: PropertyTransactionPayload,
  userId: number,
): typeof propertyTransactions.$inferInsert {
  return {
    userId,
    propertyId: payload.propertyId,
    type: payload.type,
    amount: payload.amount.toString(),
    interest: payload.interest?.toString() ?? null,
    principal: payload.principal?.toString() ?? null,
    date: payload.date,
    note: payload.note,
  };
}

function toPropertyTransactionUpdateValues(
  payload: PropertyTransactionPayload,
): Partial<typeof propertyTransactions.$inferInsert> {
  return {
    propertyId: payload.propertyId,
    type: payload.type,
    amount: payload.amount.toString(),
    interest: payload.interest?.toString() ?? null,
    principal: payload.principal?.toString() ?? null,
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

async function getOwnedHolding(userId: number, holdingId: number) {
  const [holding] = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, holdingId), eq(holdings.userId, userId)));
  return holding ?? null;
}

async function getOwnedHoldingTransaction(userId: number, transactionId: number) {
  const [transaction] = await db
    .select()
    .from(holdingTransactions)
    .where(and(eq(holdingTransactions.id, transactionId), eq(holdingTransactions.userId, userId)));
  return transaction ?? null;
}

async function getOwnedProperty(userId: number, propertyId: number) {
  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.userId, userId)));
  return property ?? null;
}

async function getOwnedPropertyTransaction(userId: number, transactionId: number) {
  const [transaction] = await db
    .select()
    .from(propertyTransactions)
    .where(
      and(eq(propertyTransactions.id, transactionId), eq(propertyTransactions.userId, userId)),
    );
  return transaction ?? null;
}

async function readPropertyPatchPayload(
  request: Pick<Request, 'json'>,
): Promise<
  { ok: true; value: Partial<PropertyPayload> } | { ok: false; error: string; status: 400 }
> {
  const rawBody = await readJsonBody(request, 'Invalid property payload');
  if (!rawBody.ok) {
    return { ok: false, error: rawBody.error, status: HTTP_STATUS.BAD_REQUEST };
  }

  const body = parsePropertyPatch(rawBody.value);
  if (!body.ok) {
    return { ok: false, error: body.error, status: HTTP_STATUS.BAD_REQUEST };
  }
  if (Object.keys(body.value).length === 0) {
    return {
      ok: false,
      error: 'No property fields provided',
      status: HTTP_STATUS.BAD_REQUEST,
    };
  }

  return body;
}

async function getOwnedMortgageForPropertyLink(userId: number, mortgageId: number) {
  const [mortgage] = await db
    .select({
      id: mortgages.id,
      outstandingBalance: mortgages.outstandingBalance,
    })
    .from(mortgages)
    .where(and(eq(mortgages.id, mortgageId), eq(mortgages.userId, userId)));
  return mortgage ?? null;
}

async function getPropertyLinkedToMortgage(params: {
  userId: number;
  mortgageId: number;
  excludePropertyId?: number;
}) {
  const linked = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.userId, params.userId), eq(properties.mortgageId, params.mortgageId)));

  return linked.find((property) => property.id !== params.excludePropertyId) ?? null;
}

async function syncMortgageSnapshotFromProperty(params: {
  userId: number;
  mortgageId: number | null;
  property: typeof properties.$inferSelect;
}): Promise<void> {
  if (params.mortgageId == null) return;

  await db
    .update(mortgages)
    .set({
      propertyAddress: params.property.address,
      currency: params.property.currency,
      propertyValue: params.property.currentValue,
    })
    .where(and(eq(mortgages.id, params.mortgageId), eq(mortgages.userId, params.userId)));
}

async function resolvePropertyMortgagePatch(params: {
  userId: number;
  propertyId: number;
  existing: typeof properties.$inferSelect;
  patch: Partial<PropertyPayload>;
}): Promise<
  | { ok: true; value: { mortgageId: number | null; mortgage: number } }
  | { ok: false; error: string; status: 404 | 409 }
> {
  const nextMortgageId = pickPatchedValue(params.patch.mortgageId, params.existing.mortgageId);
  const requestedMortgageBalance = pickPatchedValue(
    params.patch.mortgage,
    toNormalizedDecimal(params.existing.mortgage) ?? 0,
  );

  if (nextMortgageId === null) {
    return {
      ok: true,
      value: {
        mortgageId: null,
        mortgage: params.patch.mortgageId === undefined ? requestedMortgageBalance : 0,
      },
    };
  }

  const mortgage = await getOwnedMortgageForPropertyLink(params.userId, nextMortgageId);
  if (!mortgage) return { ok: false, error: 'Mortgage not found', status: HTTP_STATUS.NOT_FOUND };

  const linkedProperty = await getPropertyLinkedToMortgage({
    userId: params.userId,
    mortgageId: nextMortgageId,
    excludePropertyId: params.propertyId,
  });
  if (linkedProperty) {
    return {
      ok: false,
      error: 'Mortgage already linked to another property',
      status: HTTP_STATUS.CONFLICT,
    };
  }

  return {
    ok: true,
    value: {
      mortgageId: nextMortgageId,
      mortgage: toNormalizedDecimal(mortgage.outstandingBalance) ?? 0,
    },
  };
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
  const rawBody = await readJsonBody(c.req, 'Invalid holding payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseHoldingCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

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
    console.warn('[Investments] Failed to save initial holding price snapshot', error);
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

  const [data] = await db
    .update(holdings)
    .set(toHoldingUpdateValues(body.value))
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

app.get('/holding-price-history', async (c) => {
  const user = getAuthUser(c);
  const parsedQuery = parseHoldingPriceHistoryQuery({
    rawHoldingIds: c.req.query('holdingIds') ?? null,
    rawFrom: c.req.query('from') ?? null,
    rawTo: c.req.query('to') ?? null,
  });
  if ('error' in parsedQuery) return c.json({ error: parsedQuery.error }, HTTP_STATUS.BAD_REQUEST);
  const { holdingIds, from, to } = parsedQuery.value;

  const conditions = [eq(holdingPriceHistory.userId, user.id)];
  if (holdingIds.length > 0) conditions.push(inArray(holdingPriceHistory.holdingId, holdingIds));
  if (from) conditions.push(gte(holdingPriceHistory.eodDate, from));
  if (to) conditions.push(lte(holdingPriceHistory.eodDate, to));

  const data = await db
    .select()
    .from(holdingPriceHistory)
    .where(and(...conditions))
    .orderBy(asc(holdingPriceHistory.eodDate), asc(holdingPriceHistory.holdingId));
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
  const rawBody = await readJsonBody(c.req, 'Invalid holding transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseHoldingTransactionCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const holding = await getOwnedHolding(user.id, body.value.holdingId);
  if (!holding) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .insert(holdingTransactions)
    .values(toHoldingTransactionInsertValues(body.value, user.id))
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/holding-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const existing = await getOwnedHoldingTransaction(user.id, id);
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const rawBody = await readJsonBody(c.req, 'Invalid holding transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseHoldingTransactionPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No holding transaction fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const merged = mergeHoldingTransactionPayload(body.value, existing);
  if (!merged.ok) return c.json({ error: merged.error }, HTTP_STATUS.BAD_REQUEST);

  const holding = await getOwnedHolding(user.id, merged.value.holdingId);
  if (!holding) return c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);

  const [data] = await db
    .update(holdingTransactions)
    .set(toHoldingTransactionUpdateValues(merged.value))
    .where(and(eq(holdingTransactions.id, id), eq(holdingTransactions.userId, user.id)))
    .returning();
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
  const rawBody = await readJsonBody(c.req, 'Invalid property payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePropertyCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  let mortgageBalance = body.value.mortgage;
  if (body.value.mortgageId !== null) {
    const mortgage = await getOwnedMortgageForPropertyLink(user.id, body.value.mortgageId);
    if (!mortgage) return c.json({ error: 'Mortgage not found' }, HTTP_STATUS.NOT_FOUND);

    const linkedProperty = await getPropertyLinkedToMortgage({
      userId: user.id,
      mortgageId: body.value.mortgageId,
    });
    if (linkedProperty) {
      return c.json({ error: 'Mortgage already linked to another property' }, HTTP_STATUS.CONFLICT);
    }

    mortgageBalance = toNormalizedDecimal(mortgage.outstandingBalance) ?? 0;
  }

  const propertyPayload = {
    ...body.value,
    mortgage: mortgageBalance,
  };

  const [data] = await db
    .insert(properties)
    .values(toPropertyInsertValues(propertyPayload, user.id))
    .returning();

  await syncMortgageSnapshotFromProperty({
    userId: user.id,
    mortgageId: data.mortgageId,
    property: data,
  });
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/properties/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid property id' }, HTTP_STATUS.BAD_REQUEST);

  const existing = await getOwnedProperty(user.id, id);
  if (!existing) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);

  const body = await readPropertyPatchPayload(c.req);
  if (!body.ok) return c.json({ error: body.error }, body.status);
  const mortgagePatch = await resolvePropertyMortgagePatch({
    userId: user.id,
    propertyId: id,
    existing,
    patch: body.value,
  });
  if (!mortgagePatch.ok) return c.json({ error: mortgagePatch.error }, mortgagePatch.status);

  const updates: Partial<PropertyPayload> = {
    ...body.value,
    ...mortgagePatch.value,
  };

  const [data] = await db
    .update(properties)
    .set(toPropertyUpdateValues(updates))
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
    .returning();

  await syncMortgageSnapshotFromProperty({
    userId: user.id,
    mortgageId: data.mortgageId,
    property: data,
  });
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
  const rawBody = await readJsonBody(c.req, 'Invalid property transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePropertyTransactionCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const property = await getOwnedProperty(user.id, body.value.propertyId);
  if (!property) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);

  const validationError = validatePropertyTransactionPayload(body.value, property);
  if (validationError) return c.json({ error: validationError }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .insert(propertyTransactions)
    .values(toPropertyTransactionInsertValues(body.value, user.id))
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/property-transactions/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid transaction id' }, HTTP_STATUS.BAD_REQUEST);

  const existing = await getOwnedPropertyTransaction(user.id, id);
  if (!existing) return c.json({ error: 'Transaction not found' }, HTTP_STATUS.NOT_FOUND);

  const rawBody = await readJsonBody(c.req, 'Invalid property transaction payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePropertyTransactionPatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No property transaction fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const merged = mergePropertyTransactionPayload(body.value, existing);
  if (!merged.ok) return c.json({ error: merged.error }, HTTP_STATUS.BAD_REQUEST);

  const property = await getOwnedProperty(user.id, merged.value.propertyId);
  if (!property) return c.json({ error: 'Property not found' }, HTTP_STATUS.NOT_FOUND);

  const validationError = validatePropertyTransactionPayload(merged.value, property);
  if (validationError) return c.json({ error: validationError }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .update(propertyTransactions)
    .set(toPropertyTransactionUpdateValues(merged.value))
    .where(and(eq(propertyTransactions.id, id), eq(propertyTransactions.userId, user.id)))
    .returning();
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
