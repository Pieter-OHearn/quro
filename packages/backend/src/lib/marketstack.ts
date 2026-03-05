import type { StockPriceResult, TickerLookupResult } from '@quro/shared';
import { getMarketDataClient } from './marketDataClient';

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

export async function lookupTicker(symbol: string): Promise<TickerLookupResult> {
  const normalizedSymbol = normalizeTicker(symbol);
  const marketDataClient = getMarketDataClient();
  const profile = await marketDataClient.lookupSymbol(normalizedSymbol);
  const latestEod = await marketDataClient.getLatestEod([profile.symbol || normalizedSymbol]);

  const quote = latestEod[normalizeTicker(profile.symbol)] ??
    latestEod[normalizedSymbol] ?? {
      close: null,
      priceCurrency: null,
      tradeLast: null,
      eodDate: null,
    };

  return {
    ...profile,
    currentPrice: quote.close,
    currency: quote.priceCurrency,
    priceCurrency: quote.priceCurrency,
    priceUpdatedAt: quote.tradeLast,
    eodDate: quote.eodDate,
  };
}

export async function fetchStockPrice(ticker: string): Promise<StockPriceResult> {
  const normalizedTicker = normalizeTicker(ticker);
  const marketDataClient = getMarketDataClient();
  const latestEod = await marketDataClient.getLatestEod([normalizedTicker]);
  const quote = latestEod[normalizedTicker];

  if (!quote || typeof quote.close !== 'number' || !Number.isFinite(quote.close)) {
    throw new Error(`No valid EOD close price found for ticker: ${normalizedTicker}`);
  }

  return {
    ticker: normalizedTicker,
    price: quote.close,
    currency: quote.priceCurrency ?? 'USD',
    tradeLast: quote.tradeLast,
    eodDate: quote.eodDate,
    priceCurrency: quote.priceCurrency,
  };
}
