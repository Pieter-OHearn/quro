import { syncAllHoldingPrices } from './holdingPriceSync';
import { JOB_INTERVAL_MS } from './operationalStatus';
import { startIntervalJob } from './intervalJob';
import { log } from './logger';

const SYNC_INTERVAL_MS = JOB_INTERVAL_MS['holding-price-sync'];

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
  log.info('job.holding_price_sync.done', {
    updated: result.summary.updatedHoldings,
    requested: result.summary.requestedHoldings,
    symbols: result.summary.requestedSymbols,
  });
  for (const issue of result.summary.issues) {
    log.warn('job.holding_price_sync.issue', { holdingId: issue.holdingId, reason: issue.reason });
  }
}
