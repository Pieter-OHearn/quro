import { CURRENCY_CODES, type CurrencyCode } from '@quro/shared';
import { asc, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { currencyRates } from '../db/schema';
import {
  buildRatesToBaseCurrency,
  CurrencyRatesUnavailableError,
  FX_BASE_CURRENCY,
} from './currencyRateCache';
import { getMarketDataClient } from './marketDataClient';

const YAHOO_FX_PROVIDER = 'yahoo_finance';
const DATE_PART_LENGTH = 10;

type CurrencyRateQuote = {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  provider: string;
  sourceDate: string;
};

export type CurrencyRateSyncIssue = {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  reason: string;
};

export type CurrencyRateFetchResult = {
  rates: CurrencyRateQuote[];
  issues: CurrencyRateSyncIssue[];
};

export type CurrencyRateSyncSummary = {
  requestedRates: number;
  updatedRates: number;
  skippedRates: number;
  issues: CurrencyRateSyncIssue[];
  syncedAt: string;
};

export type CurrentCurrencyRateRow = {
  id: number;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: string;
  provider: string;
  sourceDate: string;
  updatedAt: Date;
};

type CurrencyRateFetcher = (
  baseCurrency: CurrencyCode,
  fromCurrencies: CurrencyCode[],
) => Promise<CurrencyRateFetchResult>;

function toYahooFxSymbol(fromCurrency: CurrencyCode, toCurrency: CurrencyCode): string {
  return `${fromCurrency}${toCurrency}=X`;
}

function toDateOnly(value: string | null | undefined, fallback: Date): string {
  if (!value) return fallback.toISOString().slice(0, DATE_PART_LENGTH);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? fallback.toISOString().slice(0, DATE_PART_LENGTH)
    : parsed.toISOString().slice(0, DATE_PART_LENGTH);
}

function buildIssue(
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  reason: string,
): CurrencyRateSyncIssue {
  return { fromCurrency, toCurrency, reason };
}

export async function fetchYahooCurrencyRates(
  baseCurrency: CurrencyCode,
  fromCurrencies: CurrencyCode[],
): Promise<CurrencyRateFetchResult> {
  const marketDataClient = getMarketDataClient();
  const symbolsByCurrency = new Map(
    fromCurrencies.map((currency) => [currency, toYahooFxSymbol(currency, baseCurrency)]),
  );
  const quotes = await marketDataClient.getLatestEod([...symbolsByCurrency.values()]);
  const now = new Date();
  const rates: CurrencyRateQuote[] = [];
  const issues: CurrencyRateSyncIssue[] = [];

  for (const [fromCurrency, symbol] of symbolsByCurrency) {
    const quote = quotes[symbol];
    if (!quote || typeof quote.close !== 'number' || !Number.isFinite(quote.close)) {
      issues.push(buildIssue(fromCurrency, baseCurrency, 'No valid FX quote returned by provider'));
      continue;
    }

    rates.push({
      fromCurrency,
      toCurrency: baseCurrency,
      rate: quote.close,
      provider: YAHOO_FX_PROVIDER,
      sourceDate: toDateOnly(quote.eodDate ?? quote.tradeLast, now),
    });
  }

  return { rates, issues };
}

export function getCurrencyRateSyncCurrencies(
  baseCurrency: CurrencyCode = FX_BASE_CURRENCY,
): CurrencyCode[] {
  return CURRENCY_CODES.filter((currency) => currency !== baseCurrency);
}

export function loadCurrencyRateCacheRows(): Promise<CurrentCurrencyRateRow[]> {
  return db
    .select({
      id: currencyRates.id,
      fromCurrency: currencyRates.fromCurrency,
      toCurrency: currencyRates.toCurrency,
      rate: currencyRates.rate,
      provider: currencyRates.provider,
      sourceDate: currencyRates.sourceDate,
      updatedAt: currencyRates.updatedAt,
    })
    .from(currencyRates)
    .orderBy(asc(currencyRates.fromCurrency), asc(currencyRates.toCurrency));
}

function shouldRefreshCurrencyRateCache(
  rows: readonly CurrentCurrencyRateRow[],
  baseCurrency: CurrencyCode,
): boolean {
  if (rows.length === 0) return true;

  try {
    buildRatesToBaseCurrency(rows, new Date(), baseCurrency);
    return false;
  } catch (error) {
    if (error instanceof CurrencyRatesUnavailableError) return true;
    throw error;
  }
}

export async function getCurrentCurrencyRateRows(
  baseCurrency: CurrencyCode = FX_BASE_CURRENCY,
): Promise<CurrentCurrencyRateRow[]> {
  let rows = await loadCurrencyRateCacheRows();

  if (shouldRefreshCurrencyRateCache(rows, baseCurrency)) {
    await syncCurrencyRates({ baseCurrency });
    rows = await loadCurrencyRateCacheRows();
  }

  buildRatesToBaseCurrency(rows, new Date(), baseCurrency);
  return rows;
}

export async function getCurrentRatesToBaseCurrency(
  baseCurrency: CurrencyCode = FX_BASE_CURRENCY,
): Promise<Map<string, number>> {
  const rows = await getCurrentCurrencyRateRows(baseCurrency);
  return buildRatesToBaseCurrency(rows, new Date(), baseCurrency);
}

export async function syncCurrencyRates(
  options: {
    baseCurrency?: CurrencyCode;
    fetchRates?: CurrencyRateFetcher;
    syncedAt?: Date;
  } = {},
): Promise<CurrencyRateSyncSummary> {
  const baseCurrency = options.baseCurrency ?? FX_BASE_CURRENCY;
  const fromCurrencies = getCurrencyRateSyncCurrencies(baseCurrency);
  const fetchRates = options.fetchRates ?? fetchYahooCurrencyRates;
  const syncedAt = options.syncedAt ?? new Date();
  const result = await fetchRates(baseCurrency, fromCurrencies);

  if (result.rates.length > 0) {
    await db
      .insert(currencyRates)
      .values(
        result.rates.map((rate) => ({
          fromCurrency: rate.fromCurrency,
          toCurrency: rate.toCurrency,
          rate: String(rate.rate),
          provider: rate.provider,
          sourceDate: rate.sourceDate,
          updatedAt: syncedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [currencyRates.fromCurrency, currencyRates.toCurrency],
        set: {
          rate: sql`excluded.rate`,
          provider: sql`excluded.provider`,
          sourceDate: sql`excluded.source_date`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  return {
    requestedRates: fromCurrencies.length,
    updatedRates: result.rates.length,
    skippedRates: fromCurrencies.length - result.rates.length,
    issues: result.issues,
    syncedAt: syncedAt.toISOString(),
  };
}
