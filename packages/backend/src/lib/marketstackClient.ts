import { parseTickerItemType, type TickerItemType, type TickerLookupExchange } from '@quro/shared';
import type {
  EodLatestMap,
  EodLatestQuote,
  MarketDataClient,
  TickerLookupProfile,
} from './marketDataClient';

const MARKETSTACK_BASE_URL = 'https://api.marketstack.com/v2';
export const MARKETSTACK_EOD_SYMBOL_LIMIT = 100;
const DATE_PART_LENGTH = 10;

type UnknownRecord = Record<string, unknown>;

const ITEM_TYPE_MAP: Record<string, TickerItemType> = {
  stock: 'equity',
  equity: 'equity',
  etf: 'etf',
  fund: 'fund',
  adr: 'adr',
  trust: 'trust',
  warrant: 'warrant',
  right: 'right',
  unit: 'unit',
  preferred: 'preference',
  preference: 'preference',
};
const ITEM_TYPE_KEYWORD_RULES: Array<{ keyword: string; itemType: TickerItemType }> = [
  { keyword: 'etf', itemType: 'etf' },
  { keyword: 'fund', itemType: 'fund' },
  { keyword: 'mutual', itemType: 'fund' },
  { keyword: 'stock', itemType: 'equity' },
  { keyword: 'equity', itemType: 'equity' },
  { keyword: 'trust', itemType: 'trust' },
  { keyword: 'warrant', itemType: 'warrant' },
  { keyword: 'right', itemType: 'right' },
  { keyword: 'unit', itemType: 'unit' },
  { keyword: 'preferred', itemType: 'preference' },
  { keyword: 'preference', itemType: 'preference' },
];

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = toStringValue(value);
    if (parsed) return parsed;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const compact = trimmed.replace(/\s+/g, '');
    const hasComma = compact.includes(',');
    const hasDot = compact.includes('.');
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
  return null;
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeCurrency(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toUpperCase() || null;
}

function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDateOnly(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, DATE_PART_LENGTH);
}

function mapItemType(raw: string | null): TickerItemType | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  const mapped = ITEM_TYPE_MAP[normalized];
  if (mapped) return mapped;
  for (const rule of ITEM_TYPE_KEYWORD_RULES) {
    if (normalized.includes(rule.keyword)) return rule.itemType;
  }
  return parseTickerItemType(normalized);
}

function resolveItemType(entry: UnknownRecord): TickerItemType {
  const rawItemType = firstString(
    entry.asset_type,
    entry.type,
    entry.security_type,
    entry.instrument_type,
    entry.symbol_type,
    entry.class,
    entry.name,
  );
  return mapItemType(rawItemType) ?? 'equity';
}

function getExchangeValue(
  entry: UnknownRecord,
  nestedExchange: UnknownRecord | null,
  nestedKey: string,
  ...entryKeys: string[]
): string | null {
  const entryValues = entryKeys.map((entryKey) => entry[entryKey]);
  return firstString(nestedExchange?.[nestedKey], ...entryValues);
}

function buildExchange(entry: UnknownRecord): TickerLookupExchange | null {
  const nestedExchange = isRecord(entry.exchange) ? entry.exchange : null;
  const mic = getExchangeValue(entry, nestedExchange, 'mic', 'exchange_mic', 'mic');
  if (!mic) return null;

  return {
    mic,
    name: getExchangeValue(entry, nestedExchange, 'name', 'exchange_name', 'exchange') ?? mic,
    acronym: getExchangeValue(entry, nestedExchange, 'acronym', 'exchange_acronym') ?? '',
    country: getExchangeValue(entry, nestedExchange, 'country', 'country'),
    countryCode: getExchangeValue(entry, nestedExchange, 'country_code', 'country_code') ?? '',
    city: getExchangeValue(entry, nestedExchange, 'city', 'city') ?? '',
    website: getExchangeValue(entry, nestedExchange, 'website', 'website') ?? '',
  };
}

function extractDataRows(payload: unknown): UnknownRecord[] {
  if (!isRecord(payload)) return [];
  const data = payload.data;
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) return [data];
  return [];
}

function extractTickerEntry(payload: unknown): UnknownRecord | null {
  const rows = extractDataRows(payload);
  if (rows.length > 0) return rows[0];
  return isRecord(payload) ? payload : null;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const payloadError = payload.error;
  if (!isRecord(payloadError)) return null;
  return toStringValue(payloadError.message) ?? toStringValue(payloadError.type);
}

function isMoreRecentQuote(nextQuote: EodLatestQuote, currentQuote: EodLatestQuote): boolean {
  if (!currentQuote.tradeLast) return true;
  if (!nextQuote.tradeLast) return false;
  return Date.parse(nextQuote.tradeLast) > Date.parse(currentQuote.tradeLast);
}

function createEmptyEodQuote(symbol: string): EodLatestQuote {
  return {
    symbol,
    close: null,
    priceCurrency: null,
    eodDate: null,
    tradeLast: null,
  };
}

function parseEodQuote(row: UnknownRecord): EodLatestQuote | null {
  const symbol = normalizeSymbol(toStringValue(row.symbol) ?? '');
  if (!symbol) return null;

  return {
    symbol,
    close: toNumber(row.close),
    priceCurrency: normalizeCurrency(
      toStringValue(row.price_currency) ?? toStringValue(row.currency),
    ),
    tradeLast: toIsoDate(row.date ?? row.datetime ?? row.updated_at),
    eodDate: toDateOnly(toIsoDate(row.date ?? row.datetime)),
  };
}

function mergeEodQuote(quotes: EodLatestMap, quote: EodLatestQuote): void {
  const existing = quotes[quote.symbol];
  if (!existing || isMoreRecentQuote(quote, existing)) {
    quotes[quote.symbol] = quote;
  }
}

export class MarketstackMarketDataClient implements MarketDataClient {
  private readonly accessKey: string;
  private readonly baseUrl: string;

  constructor(accessKey = process.env.MARKETSTACK_API_KEY, baseUrl = MARKETSTACK_BASE_URL) {
    if (!accessKey?.trim()) {
      throw new Error('MARKETSTACK_API_KEY is required to fetch market data');
    }
    this.accessKey = accessKey.trim();
    this.baseUrl = baseUrl;
  }

  async lookupSymbol(symbol: string): Promise<TickerLookupProfile> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const payload = await this.requestJson(`tickers/${encodeURIComponent(normalizedSymbol)}`);
    const entry = extractTickerEntry(payload);
    if (!entry) {
      throw new Error(`Ticker not found: ${normalizedSymbol}`);
    }

    const resolvedSymbol = normalizeSymbol(toStringValue(entry.symbol) ?? normalizedSymbol);
    return {
      name: toStringValue(entry.name) ?? resolvedSymbol,
      symbol: resolvedSymbol,
      itemType: resolveItemType(entry),
      sector: toStringValue(entry.sector),
      industry: toStringValue(entry.industry),
      exchange: buildExchange(entry),
    };
  }

  async getLatestEod(symbols: string[]): Promise<EodLatestMap> {
    const normalizedSymbols = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
    if (normalizedSymbols.length === 0) return {};
    if (normalizedSymbols.length > MARKETSTACK_EOD_SYMBOL_LIMIT) {
      throw new Error(
        `Marketstack eod/latest supports up to ${MARKETSTACK_EOD_SYMBOL_LIMIT} symbols per request`,
      );
    }

    const payload = await this.requestJson('eod/latest', { symbols: normalizedSymbols.join(',') });
    const rows = extractDataRows(payload);
    const quotes: EodLatestMap = Object.fromEntries(
      normalizedSymbols.map((ticker) => [ticker, createEmptyEodQuote(ticker)]),
    );

    for (const row of rows) {
      const quote = parseEodQuote(row);
      if (!quote) continue;
      mergeEodQuote(quotes, quote);
    }

    return quotes;
  }

  private async requestJson(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const normalizedPath = path.replace(/^\/+/, '');
    const normalizedBaseUrl = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const url = new URL(normalizedPath, normalizedBaseUrl);
    url.searchParams.set('access_key', this.accessKey);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());
    const payload = await response.json().catch(() => null);
    const providerError = extractErrorMessage(payload);
    if (!response.ok) {
      throw new Error(
        providerError ??
          `Marketstack request failed (${response.status}) for ${url.pathname.replace(/^\/v2\//, '')}`,
      );
    }
    if (providerError) {
      throw new Error(providerError);
    }
    return payload;
  }
}
