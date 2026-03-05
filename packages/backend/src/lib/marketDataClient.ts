import type { TickerItemType, TickerLookupExchange } from '@quro/shared';
import { MarketstackMarketDataClient } from './marketstackClient';

export type TickerLookupProfile = {
  name: string;
  symbol: string;
  itemType: TickerItemType | null;
  sector: string | null;
  industry: string | null;
  exchange: TickerLookupExchange | null;
};

export type EodLatestQuote = {
  symbol: string;
  close: number | null;
  priceCurrency: string | null;
  eodDate: string | null;
  tradeLast: string | null;
};

export type EodLatestMap = Record<string, EodLatestQuote>;

export interface MarketDataClient {
  lookupSymbol(symbol: string): Promise<TickerLookupProfile>;
  getLatestEod(symbols: string[]): Promise<EodLatestMap>;
}

let singletonClient: MarketDataClient | null = null;

export function getMarketDataClient(): MarketDataClient {
  if (singletonClient) return singletonClient;
  singletonClient = new MarketstackMarketDataClient();
  return singletonClient;
}
