import { isHoldingPriceStale, PRICE_STALE_AFTER_DAYS } from '@quro/shared';

export { PRICE_STALE_AFTER_DAYS };

/** Whether a holding's synced price is old; see `isHoldingPriceStale`. */
export const isPriceStale = isHoldingPriceStale;
