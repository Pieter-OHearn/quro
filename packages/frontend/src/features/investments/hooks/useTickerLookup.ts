import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { TickerLookupResult } from '@quro/shared';

type TickerLookupState = {
  data: TickerLookupResult | null;
  isLoading: boolean;
  error: string | null;
};

const LOOKUP_TICKER_UNAVAILABLE_MESSAGE = 'Lookup Ticker feature is not available.';

export function createLatestRequestTracker() {
  let latestRequestId = 0;

  return {
    issue() {
      latestRequestId += 1;
      return latestRequestId;
    },
    isLatest(requestId: number) {
      return requestId === latestRequestId;
    },
  };
}

export function useTickerLookup() {
  const requestTracker = useRef(createLatestRequestTracker()).current;
  const [state, setState] = useState<TickerLookupState>({
    data: null,
    isLoading: false,
    error: null,
  });

  async function lookup(symbol: string): Promise<TickerLookupResult | null> {
    if (!symbol.trim()) return null;
    const requestId = requestTracker.issue();
    setState({ data: null, isLoading: true, error: null });
    try {
      const { data } = await api.get(
        `/api/investments/ticker-lookup/${encodeURIComponent(symbol.trim().toUpperCase())}`,
      );
      const result = data.data as TickerLookupResult;
      if (!requestTracker.isLatest(requestId)) return null;
      setState({ data: result, isLoading: false, error: null });
      return result;
    } catch {
      if (!requestTracker.isLatest(requestId)) return null;
      setState({ data: null, isLoading: false, error: LOOKUP_TICKER_UNAVAILABLE_MESSAGE });
      return null;
    }
  }

  return { ...state, lookup };
}
