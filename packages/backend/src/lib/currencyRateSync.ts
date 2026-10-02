import { CURRENCY_CODES, type CurrencyCode, toDateOnlyOr } from '@quro/shared';
import { asc, desc, gte, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { currencyRateHistory, currencyRates } from '../db/schema';
import { buildRatesToBaseCurrency, FX_BASE_CURRENCY } from './currencyRateCache';
import { getMarketDataClient } from './marketDataClient';

const YAHOO_FX_PROVIDER = 'yahoo_finance';

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
  rate: number;
  provider: string;
  sourceDate: string;
  updatedAt: Date;
};

export type HistoricalCurrencyRateDbRow = Omit<CurrentCurrencyRateRow, 'id'>;

type CurrencyRateFetcher = (
  baseCurrency: CurrencyCode,
  fromCurrencies: CurrencyCode[],
) => Promise<CurrencyRateFetchResult>;

function toYahooFxSymbol(fromCurrency: CurrencyCode, toCurrency: CurrencyCode): string {
  return `${fromCurrency}${toCurrency}=X`;
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
      sourceDate: toDateOnlyOr(quote.eodDate ?? quote.tradeLast, now),
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

export function loadCurrencyRateHistoryRows(
  windowStart?: string,
): Promise<HistoricalCurrencyRateDbRow[]> {
  const columns = {
    fromCurrency: currencyRateHistory.fromCurrency,
    toCurrency: currencyRateHistory.toCurrency,
    rate: currencyRateHistory.rate,
    provider: currencyRateHistory.provider,
    sourceDate: currencyRateHistory.sourceDate,
    updatedAt: currencyRateHistory.updatedAt,
  };
  if (windowStart) {
    const pairs = [currencyRateHistory.fromCurrency, currencyRateHistory.toCurrency];
    const before = db
      .selectDistinctOn(pairs, columns)
      .from(currencyRateHistory)
      .where(lt(currencyRateHistory.sourceDate, windowStart))
      .orderBy(...pairs, desc(currencyRateHistory.sourceDate));
    return db
      .select(columns)
      .from(currencyRateHistory)
      .where(gte(currencyRateHistory.sourceDate, windowStart))
      .unionAll(before);
  }
  return db
    .select({
      fromCurrency: currencyRateHistory.fromCurrency,
      toCurrency: currencyRateHistory.toCurrency,
      rate: currencyRateHistory.rate,
      provider: currencyRateHistory.provider,
      sourceDate: currencyRateHistory.sourceDate,
      updatedAt: currencyRateHistory.updatedAt,
    })
    .from(currencyRateHistory)
    .orderBy(
      asc(currencyRateHistory.fromCurrency),
      asc(currencyRateHistory.toCurrency),
      asc(currencyRateHistory.sourceDate),
    );
}

export async function getHistoricalCurrencyRateRows(
  windowStart?: string,
): Promise<HistoricalCurrencyRateDbRow[]> {
  const [history, current] = await Promise.all([
    loadCurrencyRateHistoryRows(windowStart),
    getCurrentCurrencyRateRows(),
  ]);
  return [...history, ...current.map(({ id: _id, ...row }) => row)];
}

const CURRENT_RATE_CACHE_MS = 60_000;
let cacheRevision = 0;
let currentRows: { rows: CurrentCurrencyRateRow[]; loadedAt: number } | null = null;
let currentLoad: Promise<CurrentCurrencyRateRow[]> | null = null;
const syncs = new Map<CurrencyCode, Promise<CurrencyRateSyncSummary>>();

export async function getCurrentCurrencyRateRows(
  baseCurrency: CurrencyCode = FX_BASE_CURRENCY,
): Promise<CurrentCurrencyRateRow[]> {
  if (!currentRows || Date.now() - currentRows.loadedAt >= CURRENT_RATE_CACHE_MS) {
    const revision = cacheRevision;
    currentLoad ??= loadCurrencyRateCacheRows()
      .then((rows) => {
        if (revision === cacheRevision) currentRows = { rows, loadedAt: Date.now() };
        return rows;
      })
      .finally(() => {
        currentLoad = null;
      });
    await currentLoad;
    if (!currentRows) return getCurrentCurrencyRateRows(baseCurrency);
  }
  const rows = currentRows!.rows;
  // Provider refresh belongs to the scheduler, never to a dashboard request.
  buildRatesToBaseCurrency(rows, baseCurrency);
  return rows;
}

export async function getCurrentRatesToBaseCurrency(
  baseCurrency: CurrencyCode = FX_BASE_CURRENCY,
): Promise<Map<string, number>> {
  const rows = await getCurrentCurrencyRateRows(baseCurrency);
  return buildRatesToBaseCurrency(rows, baseCurrency);
}

async function performCurrencyRateSync(
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
    const values = result.rates.map((rate) => ({
      fromCurrency: rate.fromCurrency,
      toCurrency: rate.toCurrency,
      rate: rate.rate,
      provider: rate.provider,
      sourceDate: rate.sourceDate,
      updatedAt: syncedAt,
    }));

    await db.transaction(async (tx) => {
      await tx
        .insert(currencyRates)
        .values(values)
        .onConflictDoUpdate({
          target: [currencyRates.fromCurrency, currencyRates.toCurrency],
          set: {
            rate: sql`excluded.rate`,
            provider: sql`excluded.provider`,
            sourceDate: sql`excluded.source_date`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
      await tx
        .insert(currencyRateHistory)
        .values(values)
        .onConflictDoNothing({
          target: [
            currencyRateHistory.fromCurrency,
            currencyRateHistory.toCurrency,
            currencyRateHistory.sourceDate,
          ],
        });
    });
  }

  invalidateCurrentCurrencyRateCache();
  return {
    requestedRates: fromCurrencies.length,
    updatedRates: result.rates.length,
    skippedRates: fromCurrencies.length - result.rates.length,
    issues: result.issues,
    syncedAt: syncedAt.toISOString(),
  };
}

export function syncCurrencyRates(
  options: Parameters<typeof performCurrencyRateSync>[0] = {},
): Promise<CurrencyRateSyncSummary> {
  const base = options.baseCurrency ?? FX_BASE_CURRENCY;
  const existing = syncs.get(base);
  if (existing) return existing;
  const pending = performCurrencyRateSync(options).finally(() => {
    syncs.delete(base);
  });
  syncs.set(base, pending);
  return pending;
}

export function invalidateCurrentCurrencyRateCache(): void {
  cacheRevision++;
  currentRows = null;
}
