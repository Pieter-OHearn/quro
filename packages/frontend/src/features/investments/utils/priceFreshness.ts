import type { Holding } from '@quro/shared';

/** A synced price older than this is shown as stale; markets close for a long weekend at most. */
export const PRICE_STALE_AFTER_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type PricedHolding = Pick<Holding, 'priceUpdatedAt' | 'manualPrice' | 'excludeFromSync'>;

/**
 * Whether a holding's synced price is old. A price someone entered by hand, or a holding with
 * price sync switched off, is a choice and not a failed sync, so neither is stale. A synced
 * holding that never got a price date is not flagged either: it has no age to report.
 */
export function isPriceStale(holding: PricedHolding, now: Date = new Date()): boolean {
  if (holding.manualPrice != null || holding.excludeFromSync) return false;
  if (!holding.priceUpdatedAt) return false;
  const updated = Date.parse(holding.priceUpdatedAt);
  if (!Number.isFinite(updated)) return false;
  return now.getTime() - updated > PRICE_STALE_AFTER_DAYS * MS_PER_DAY;
}
