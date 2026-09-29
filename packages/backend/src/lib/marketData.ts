import type { TickerLookupResult } from '@quro/shared';
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
