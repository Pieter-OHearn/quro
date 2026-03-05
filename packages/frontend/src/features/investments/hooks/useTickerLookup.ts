import { useState } from 'react';
import { api } from '@/lib/api';
import type { TickerLookupResult } from '@quro/shared';

type TickerLookupState = {
  data: TickerLookupResult | null;
  isLoading: boolean;
  error: string | null;
};

const LOOKUP_TICKER_UNAVAILABLE_MESSAGE = 'Lookup Ticker feature is not available.';

export function useTickerLookup() {
  const [state, setState] = useState<TickerLookupState>({
    data: null,
    isLoading: false,
    error: null,
  });

  async function lookup(symbol: string): Promise<TickerLookupResult | null> {
    if (!symbol.trim()) return null;
    setState({ data: null, isLoading: true, error: null });
    try {
      const { data } = await api.get(
        `/api/investments/ticker-lookup/${encodeURIComponent(symbol.trim().toUpperCase())}`,
      );
      const result = data.data as TickerLookupResult;
      setState({ data: result, isLoading: false, error: null });
      return result;
    } catch {
      setState({ data: null, isLoading: false, error: LOOKUP_TICKER_UNAVAILABLE_MESSAGE });
      return null;
    }
  }

  return { ...state, lookup };
}
