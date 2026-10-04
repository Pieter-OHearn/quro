import {
  isCurrencyCode,
  type HoldingPriceSyncResult,
  type StockPriceResult,
  toDateOnlyOr,
} from '@quro/shared';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { holdingPriceHistory, holdings } from '../db/schema';
import { getMarketDataClient } from './marketDataClient';
import { rethrowCancellation, toYahooSymbol } from './yahooFinanceClient';

const QUOTE_BATCH_SIZE = 50;

type HoldingRow = typeof holdings.$inferSelect;
type QuoteByTicker = Record<
  string,
  {
    close: number | null;
    priceCurrency: string | null;
    eodDate: string | null;
    tradeLast: string | null;
  }
>;

type UpdatedHoldingPrice = {
  holding: HoldingRow;
  price: StockPriceResult;
};

type HoldingUpdateResult = {
  updated: UpdatedHoldingPrice;
  issue?: HoldingIssue;
};

export type HoldingPriceSyncOutcome = {
  summary: HoldingPriceSyncResult;
  updates: UpdatedHoldingPrice[];
};

type PriceSnapshotInput = {
  userId: number;
  holdingId: number;
  eodDate: string;
  closePrice: number;
  priceCurrency: string;
};

type HoldingIssue = HoldingPriceSyncResult['issues'][number];

type HoldingQuoteCheck =
  | {
      ticker: string;
      quote: {
        close: number;
        priceCurrency: string | null;
        eodDate: string | null;
        tradeLast: string | null;
      };
    }
  | { issue: HoldingIssue };

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

function toTradeDate(value: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function chunkSymbols(symbols: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < symbols.length; index += QUOTE_BATCH_SIZE) {
    chunks.push(symbols.slice(index, index + QUOTE_BATCH_SIZE));
  }
  return chunks;
}

function buildIssue(holdingId: number, ticker: string, reason: string): HoldingIssue {
  return { holdingId, ticker, reason };
}

function getUserHoldingsForSync(userId: number, holdingIds?: number[]): Promise<HoldingRow[]> {
  if (holdingIds && holdingIds.length === 0) return Promise.resolve([]);
  const holdingIdFilter = holdingIds ?? null;
  return db
    .select()
    .from(holdings)
    .where(
      holdingIdFilter
        ? and(eq(holdings.userId, userId), inArray(holdings.id, holdingIdFilter))
        : eq(holdings.userId, userId),
    );
}

async function fetchQuotesBySymbol(symbols: string[]): Promise<{
  quotes: QuoteByTicker;
  symbolFetchErrors: Map<string, string>;
}> {
  const marketClient = getMarketDataClient();
  const quotes: QuoteByTicker = {};
  const symbolFetchErrors = new Map<string, string>();

  for (const symbolChunk of chunkSymbols(symbols)) {
    try {
      const latestQuotes = await marketClient.getLatestEod(symbolChunk);
      Object.assign(quotes, latestQuotes);
    } catch (error) {
      rethrowCancellation(error);
      const reason = error instanceof Error ? error.message : 'Failed to fetch latest EOD data';
      for (const ticker of symbolChunk) symbolFetchErrors.set(ticker, reason);
    }
  }

  return { quotes, symbolFetchErrors };
}

function validateHoldingQuote(
  holding: HoldingRow,
  yahooSymbol: string,
  quotes: QuoteByTicker,
  symbolFetchErrors: Map<string, string>,
): HoldingQuoteCheck {
  const ticker = normalizeTicker(holding.ticker);
  const fetchError = symbolFetchErrors.get(yahooSymbol);
  if (fetchError) {
    return { issue: buildIssue(holding.id, ticker, fetchError) };
  }

  const quote = quotes[yahooSymbol];
  if (!quote) {
    return { issue: buildIssue(holding.id, ticker, 'No EOD quote returned by provider') };
  }

  if (typeof quote.close !== 'number' || !Number.isFinite(quote.close)) {
    return {
      issue: buildIssue(
        holding.id,
        ticker,
        'Latest EOD quote does not include a valid close price',
      ),
    };
  }

  return {
    ticker,
    quote: {
      close: quote.close,
      priceCurrency: quote.priceCurrency,
      eodDate: quote.eodDate,
      tradeLast: quote.tradeLast,
    },
  };
}

async function applyQuoteToHolding(
  userId: number,
  holding: HoldingRow,
  ticker: string,
  quote: {
    close: number;
    priceCurrency: string | null;
    eodDate: string | null;
    tradeLast: string | null;
  },
): Promise<HoldingUpdateResult | { issue: HoldingIssue }> {
  const normalizedPriceCurrency = normalizeCurrency(quote.priceCurrency);
  const resolvedHoldingCurrency = isCurrencyCode(normalizedPriceCurrency)
    ? normalizedPriceCurrency
    : holding.currency;
  const eodDate = toDateOnlyOr(quote.eodDate ?? quote.tradeLast);

  const [updatedHolding] = await db
    .update(holdings)
    .set({
      currentPrice: quote.close,
      currency: resolvedHoldingCurrency,
      priceUpdatedAt: toTradeDate(quote.tradeLast),
    })
    .where(and(eq(holdings.id, holding.id), eq(holdings.userId, userId)))
    .returning();

  if (!updatedHolding) {
    return { issue: buildIssue(holding.id, ticker, 'Holding no longer exists') };
  }

  let snapshotIssue: HoldingIssue | undefined;
  try {
    await upsertHoldingPriceSnapshot({
      userId,
      holdingId: holding.id,
      eodDate,
      closePrice: quote.close,
      priceCurrency: normalizedPriceCurrency ?? holding.currency,
    });
  } catch (error) {
    snapshotIssue = buildIssue(
      holding.id,
      ticker,
      'Price updated, but failed to persist history snapshot',
    );
    console.warn('[Investments] Failed to upsert holding price snapshot', error);
  }

  return {
    updated: {
      holding: updatedHolding,
      price: {
        ticker,
        price: quote.close,
        currency: normalizedPriceCurrency ?? holding.currency,
        tradeLast: quote.tradeLast,
        eodDate,
        priceCurrency: normalizedPriceCurrency,
      },
    },
    issue: snapshotIssue,
  };
}

export async function upsertHoldingPriceSnapshot(input: PriceSnapshotInput): Promise<void> {
  await db
    .insert(holdingPriceHistory)
    .values({
      userId: input.userId,
      holdingId: input.holdingId,
      eodDate: input.eodDate,
      closePrice: input.closePrice,
      priceCurrency: input.priceCurrency,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [holdingPriceHistory.holdingId, holdingPriceHistory.eodDate],
      set: {
        closePrice: input.closePrice,
        priceCurrency: input.priceCurrency,
        syncedAt: new Date(),
      },
    });
}

export async function syncHoldingPricesForUser(
  userId: number,
  options: { holdingIds?: number[] } = {},
): Promise<HoldingPriceSyncOutcome> {
  const userHoldings = await getUserHoldingsForSync(userId, options.holdingIds);

  const syncableHoldings = userHoldings.filter((h) => !h.excludeFromSync);

  // Build exchange-aware symbols (e.g. CBA + XASX → CBA.AX for Yahoo Finance)
  const yahooSymbolByHoldingId = new Map<number, string>(
    syncableHoldings.map((h) => [h.id, toYahooSymbol(normalizeTicker(h.ticker), h.exchangeMic)]),
  );
  const uniqueYahooSymbols = [...new Set(yahooSymbolByHoldingId.values())];
  const { quotes, symbolFetchErrors } = await fetchQuotesBySymbol(uniqueYahooSymbols);

  const updates: UpdatedHoldingPrice[] = [];
  const issues: HoldingIssue[] = [];

  for (const holding of syncableHoldings) {
    const yahooSymbol = yahooSymbolByHoldingId.get(holding.id) ?? normalizeTicker(holding.ticker);
    const quoteCheck = validateHoldingQuote(holding, yahooSymbol, quotes, symbolFetchErrors);
    if ('issue' in quoteCheck) {
      issues.push(quoteCheck.issue);
      continue;
    }

    const updateResult = await applyQuoteToHolding(
      userId,
      holding,
      quoteCheck.ticker,
      quoteCheck.quote,
    );
    if ('updated' in updateResult) {
      updates.push(updateResult.updated);
    }
    if ('issue' in updateResult && updateResult.issue !== undefined) {
      issues.push(updateResult.issue);
    }
  }

  return {
    summary: {
      requestedHoldings: syncableHoldings.length,
      requestedSymbols: uniqueYahooSymbols.length,
      updatedHoldings: updates.length,
      skippedHoldings: syncableHoldings.length - updates.length,
      issues,
      syncedAt: new Date().toISOString(),
    },
    updates,
  };
}

// One provider fetch per unique exchange-aware symbol across all users.
export async function syncAllHoldingPrices(): Promise<HoldingPriceSyncOutcome> {
  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.excludeFromSync, false), isNull(holdings.archivedAt)));
  const symbols = new Map(
    rows.map((row) => [row.id, toYahooSymbol(normalizeTicker(row.ticker), row.exchangeMic)]),
  );
  const uniqueSymbols = [...new Set(symbols.values())];
  const { quotes, symbolFetchErrors } = await fetchQuotesBySymbol(uniqueSymbols);
  const issues: HoldingIssue[] = [];
  const candidates: UpdatedHoldingPrice[] = [];
  for (const row of rows) {
    const check = validateHoldingQuote(row, symbols.get(row.id)!, quotes, symbolFetchErrors);
    if ('issue' in check) {
      issues.push(check.issue);
      continue;
    }
    const normalizedCurrency = normalizeCurrency(check.quote.priceCurrency);
    const currency = isCurrencyCode(normalizedCurrency) ? normalizedCurrency : row.currency;
    candidates.push({
      holding: {
        ...row,
        currentPrice: check.quote.close,
        currency,
        priceUpdatedAt: toTradeDate(check.quote.tradeLast),
      },
      price: {
        ticker: check.ticker,
        price: check.quote.close,
        currency: normalizedCurrency ?? row.currency,
        tradeLast: check.quote.tradeLast,
        eodDate: toDateOnlyOr(check.quote.eodDate ?? check.quote.tradeLast),
        priceCurrency: normalizedCurrency,
      },
    });
  }
  const updates = await persistHoldingPriceBatches(candidates);
  return {
    summary: {
      requestedHoldings: rows.length,
      requestedSymbols: uniqueSymbols.length,
      updatedHoldings: updates.length,
      skippedHoldings: rows.length - updates.length,
      issues,
      syncedAt: new Date().toISOString(),
    },
    updates,
  };
}

const HOLDING_WRITE_BATCH_SIZE = 500;

async function persistHoldingPriceBatches(
  candidates: UpdatedHoldingPrice[],
): Promise<UpdatedHoldingPrice[]> {
  const updates: UpdatedHoldingPrice[] = [];
  for (let offset = 0; offset < candidates.length; offset += HOLDING_WRITE_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + HOLDING_WRITE_BATCH_SIZE);
    // Update existing rows only; an upsert could resurrect a deleted holding.
    const changed = await db.transaction(async (tx) => {
      const values = sql.join(
        batch.map(
          ({ holding }) => sql`(
        ${holding.id}::integer, ${holding.userId}::integer, ${holding.currentPrice}::numeric,
        ${holding.currency}::currency_code, ${holding.priceUpdatedAt!.toISOString()}::timestamp
      )`,
        ),
        sql`, `,
      );
      const updated = await tx.execute<{ id: number }>(sql`
        update holdings as h set current_price = v.price, currency = v.currency, price_updated_at = v.updated_at
        from (values ${values}) as v(id, user_id, price, currency, updated_at)
        where h.id = v.id and h.user_id = v.user_id and h.archived_at is null and h.exclude_from_sync = false
        returning h.id
      `);
      const ids = new Set(updated.map((row) => row.id));
      const changed = batch.filter(({ holding }) => ids.has(holding.id));
      if (changed.length)
        await tx
          .insert(holdingPriceHistory)
          .values(
            changed.map(({ holding, price }) => ({
              holdingId: holding.id,
              userId: holding.userId,
              closePrice: price.price,
              eodDate: price.eodDate!,
              priceCurrency: price.currency,
              syncedAt: new Date(),
            })),
          )
          .onConflictDoUpdate({
            target: [holdingPriceHistory.holdingId, holdingPriceHistory.eodDate],
            set: {
              closePrice: sql`excluded.close_price`,
              priceCurrency: sql`excluded.price_currency`,
              syncedAt: sql`excluded.synced_at`,
            },
          });
      return changed;
    });
    updates.push(...changed);
  }
  return updates;
}
