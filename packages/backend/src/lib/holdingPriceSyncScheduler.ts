import { DAY_MS } from '../constants/time';
import { syncAllHoldingPrices } from './holdingPriceSync';
import { startIntervalJob } from './intervalJob';

const SYNC_INTERVAL_MS = DAY_MS;

export function startHoldingPriceSyncScheduler(): void {
  startIntervalJob({
    coordinated: true,
    name: 'holding-price-sync',
    intervalMs: SYNC_INTERVAL_MS,
    runOnStart: true,
    run: runSync,
  });
}

async function runSync(): Promise<void> {
  const result = await syncAllHoldingPrices();
  console.log(
    `[holding-price-sync] updated=${result.summary.updatedHoldings}/${result.summary.requestedHoldings} symbols=${result.summary.requestedSymbols}`,
  );
  for (const issue of result.summary.issues) {
    console.warn(`[holding-price-sync] holdingId=${issue.holdingId} ${issue.reason}`);
  }
}
