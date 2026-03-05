import { isCurrencyCode, type HoldingPriceSyncResult, type StockPriceResult } from '@quro/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { holdingPriceHistory, holdings } from '../db/schema';
import { getMarketDataClient } from './marketDataClient';
import { MARKETSTACK_EOD_SYMBOL_LIMIT } from './marketstackClient';

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
  closePrice: number | string;
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

const DATE_PART_LENGTH = 10;

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

function toDateOnly(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, DATE_PART_LENGTH);
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, DATE_PART_LENGTH);
  return parsed.toISOString().slice(0, DATE_PART_LENGTH);
}

function toTradeDate(value: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function chunkSymbols(symbols: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < symbols.length; index += MARKETSTACK_EOD_SYMBOL_LIMIT) {
    chunks.push(symbols.slice(index, index + MARKETSTACK_EOD_SYMBOL_LIMIT));
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
      const reason = error instanceof Error ? error.message : 'Failed to fetch latest EOD data';
      for (const ticker of symbolChunk) symbolFetchErrors.set(ticker, reason);
    }
  }

  return { quotes, symbolFetchErrors };
}

function validateHoldingQuote(
  holding: HoldingRow,
  quotes: QuoteByTicker,
  symbolFetchErrors: Map<string, string>,
): HoldingQuoteCheck {
  const ticker = normalizeTicker(holding.ticker);
  const fetchError = symbolFetchErrors.get(ticker);
  if (fetchError) {
    return { issue: buildIssue(holding.id, ticker, fetchError) };
  }

  const quote = quotes[ticker];
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
  const eodDate = toDateOnly(quote.eodDate ?? quote.tradeLast);

  const [updatedHolding] = await db
    .update(holdings)
    .set({
      currentPrice: String(quote.close),
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
      closePrice: String(input.closePrice),
      priceCurrency: input.priceCurrency,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [holdingPriceHistory.holdingId, holdingPriceHistory.eodDate],
      set: {
        closePrice: String(input.closePrice),
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
  const symbols = [...new Set(userHoldings.map((holding) => normalizeTicker(holding.ticker)))];
  const { quotes, symbolFetchErrors } = await fetchQuotesBySymbol(symbols);

  const updates: UpdatedHoldingPrice[] = [];
  const issues: HoldingIssue[] = [];

  for (const holding of userHoldings) {
    const quoteCheck = validateHoldingQuote(holding, quotes, symbolFetchErrors);
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
    if ('issue' in updateResult) {
      issues.push(updateResult.issue);
      continue;
    }

    if (updateResult.issue) {
      issues.push(updateResult.issue);
    }
    updates.push(updateResult.updated);
  }

  return {
    summary: {
      requestedHoldings: userHoldings.length,
      requestedSymbols: symbols.length,
      updatedHoldings: updates.length,
      skippedHoldings: userHoldings.length - updates.length,
      issues,
      syncedAt: new Date().toISOString(),
    },
    updates,
  };
}
