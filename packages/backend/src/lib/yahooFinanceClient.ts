import { parseTickerItemType, type TickerItemType, type TickerLookupExchange } from '@quro/shared';
import YahooFinance from 'yahoo-finance2';
import type {
  EodLatestMap,
  EodLatestQuote,
  MarketDataClient,
  TickerLookupProfile,
} from './marketDataClient';

const DATE_PART_LENGTH = 10;

// Maps exchange MIC codes to Yahoo Finance exchange suffixes.
// US exchanges (XNAS, XNYS, XASE, ARCX, BATS, etc.) have no suffix.
const MIC_TO_YAHOO_SUFFIX: Readonly<Record<string, string>> = {
  XASX: '.AX', // Australia
  XLON: '.L', // London
  XETR: '.DE', // Germany (XETRA)
  XTSE: '.TO', // Toronto
  XCNQ: '.CN', // Canadian NEO
  XNSE: '.NS', // India NSE
  XBOM: '.BO', // India BSE
  XHKG: '.HK', // Hong Kong
  XTOK: '.T', // Tokyo
  XJPX: '.T',
  XPAR: '.PA', // Paris
  XAMS: '.AS', // Amsterdam
  XMIL: '.MI', // Milan
  XMAD: '.MC', // Spain
  XSWX: '.SW', // Switzerland
  XSTO: '.ST', // Stockholm
  XOSL: '.OL', // Oslo
  XCSE: '.CO', // Copenhagen
  XHEL: '.HE', // Helsinki
  XLIS: '.LS', // Lisbon
  XDUB: '.IR', // Ireland
  XBRU: '.BR', // Brussels
  XWBO: '.VI', // Vienna
};

const QUOTE_TYPE_MAP: Readonly<Record<string, TickerItemType>> = {
  EQUITY: 'equity',
  ETF: 'etf',
  MUTUALFUND: 'fund',
  TRUST: 'trust',
};

export function toYahooSymbol(ticker: string, exchangeMic: string | null | undefined): string {
  if (!exchangeMic) return ticker;
  if (ticker.includes('.')) return ticker; // already has exchange suffix
  const suffix = MIC_TO_YAHOO_SUFFIX[exchangeMic.toUpperCase()];
  return suffix ? `${ticker}${suffix}` : ticker;
}

function resolveItemType(quoteType: string | null | undefined): TickerItemType {
  if (!quoteType) return 'equity';
  return (
    QUOTE_TYPE_MAP[quoteType.toUpperCase()] ??
    parseTickerItemType(quoteType.toLowerCase()) ??
    'equity'
  );
}

function toIsoString(value: Date | number | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date((value as number) * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateOnly(isoString: string | null): string | null {
  return isoString ? isoString.slice(0, DATE_PART_LENGTH) : null;
}

function emptyQuote(symbol: string): EodLatestQuote {
  return { symbol, close: null, priceCurrency: null, eodDate: null, tradeLast: null };
}

function buildExchangeFromYahoo(
  exchange: string | null | undefined,
  fullExchangeName: string | null | undefined,
): TickerLookupExchange | null {
  if (!exchange) return null;
  return {
    mic: '',
    name: String(fullExchangeName ?? exchange),
    acronym: exchange,
    country: null,
    countryCode: '',
    city: '',
    website: '',
  };
}

function extractProfileStrings(profile: unknown): {
  sector: string | null;
  industry: string | null;
} {
  if (!profile || typeof profile !== 'object') return { sector: null, industry: null };
  const p = profile as Record<string, unknown>;
  return {
    sector: typeof p.sector === 'string' ? p.sector : null,
    industry: typeof p.industry === 'string' ? p.industry : null,
  };
}

function parseQuoteRow(
  row: Record<string, unknown>,
  unique: string[],
): { key: string; quote: EodLatestQuote } | null {
  const rawSymbol = typeof row.symbol === 'string' ? row.symbol : null;
  if (!rawSymbol) return null;
  const matched = unique.find((s) => s.toUpperCase() === rawSymbol.toUpperCase()) ?? rawSymbol;
  const tradeLast = toIsoString(row.regularMarketTime as Date | number | null | undefined);
  return {
    key: matched,
    quote: {
      symbol: matched,
      close: typeof row.regularMarketPrice === 'number' ? row.regularMarketPrice : null,
      priceCurrency: typeof row.currency === 'string' ? row.currency.toUpperCase() : null,
      tradeLast,
      eodDate: toDateOnly(tradeLast),
    },
  };
}

export class YahooFinanceMarketDataClient implements MarketDataClient {
  private readonly yf: InstanceType<typeof YahooFinance>;

  constructor() {
    this.yf = new YahooFinance({
      suppressNotices: ['yahooSurvey'],
      validation: { logErrors: false },
    });
  }

  async lookupSymbol(symbol: string): Promise<TickerLookupProfile> {
    const result = await this.yf.quoteSummary(symbol, { modules: ['price', 'assetProfile'] });
    const price = result.price;
    if (!price) throw new Error(`Ticker not found: ${symbol}`);
    const { sector, industry } = extractProfileStrings(result.assetProfile);
    return {
      name: price.longName ?? price.shortName ?? symbol,
      symbol: price.symbol ?? symbol,
      itemType: resolveItemType(price.quoteType),
      sector,
      industry,
      exchange: buildExchangeFromYahoo(price.exchange, price.exchangeName),
    };
  }

  async getLatestEod(symbols: string[]): Promise<EodLatestMap> {
    const unique = [...new Set(symbols.filter(Boolean))];
    if (unique.length === 0) return {};

    const quotes: EodLatestMap = Object.fromEntries(unique.map((s) => [s, emptyQuote(s)]));

    let results: unknown[];
    try {
      const raw = await this.yf.quote(unique);
      results = Array.isArray(raw) ? raw : [raw];
    } catch {
      return quotes;
    }

    for (const item of results) {
      if (!item || typeof item !== 'object') continue;
      const parsed = parseQuoteRow(item as Record<string, unknown>, unique);
      if (parsed) quotes[parsed.key] = parsed.quote;
    }

    return quotes;
  }
}
