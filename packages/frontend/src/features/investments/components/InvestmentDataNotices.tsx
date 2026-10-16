import type { Holding } from '@quro/shared';
import { StateNotice } from '@/components/ui';
import { PRICE_STALE_AFTER_DAYS } from '../utils/priceFreshness';

type InvestmentDataNoticesProps = {
  /** Synced holdings whose price is older than the freshness limit. */
  staleHoldings: readonly Holding[];
  historyLoadFailed: boolean;
  onRetryHistory: () => void;
  onSyncPrices: () => void;
  isSyncingPrices: boolean;
};

/**
 * What the page's figures rest on when it is not the latest data: prices that stopped syncing,
 * and a price history that did not load. The figures stay visible; the notices say which input
 * is behind them.
 */
export function InvestmentDataNotices({
  staleHoldings,
  historyLoadFailed,
  onRetryHistory,
  onSyncPrices,
  isSyncingPrices,
}: Readonly<InvestmentDataNoticesProps>) {
  if (staleHoldings.length === 0 && !historyLoadFailed) return null;
  const names = staleHoldings.map((holding) => holding.ticker || holding.name);
  return (
    <div className="space-y-2">
      {staleHoldings.length > 0 ? (
        <StateNotice
          title={`${staleHoldings.length} holding${staleHoldings.length === 1 ? ' has' : 's have'} a stale price`}
          action={{ label: 'Sync prices', onClick: onSyncPrices, loading: isSyncingPrices }}
          testId="stale-prices-notice"
        >
          {names.slice(0, 4).join(', ')}
          {names.length > 4 ? ` and ${names.length - 4} more` : ''} last synced more than{' '}
          {PRICE_STALE_AFTER_DAYS} days ago. Brokerage value uses the last synced price.
        </StateNotice>
      ) : null}
      {historyLoadFailed ? (
        <StateNotice
          title="Price history could not be loaded"
          action={{ label: 'Retry', onClick: onRetryHistory }}
        >
          The portfolio chart falls back to estimated prices until it loads.
        </StateNotice>
      ) : null}
    </div>
  );
}
