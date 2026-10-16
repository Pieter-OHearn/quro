import { getCurrentCurrencyRateRows, syncCurrencyRates } from './currencyRateSync';
import { JOB_INTERVAL_MS } from './operationalStatus';
import { startIntervalJob } from './intervalJob';
import { log } from './logger';

const SYNC_INTERVAL_MS = JOB_INTERVAL_MS['currency-rate-sync'];

export function startCurrencyRateSyncScheduler(): void {
  startIntervalJob({
    coordinated: true,
    name: 'currency-rate-sync',
    intervalMs: SYNC_INTERVAL_MS,
    runOnStart: true,
    run: runSync,
  });
}

async function runSync(): Promise<void> {
  const result = await syncCurrencyRates();
  await getCurrentCurrencyRateRows();
  const status =
    result.issues.length > 0
      ? `partial (${result.updatedRates}/${result.requestedRates} updated)`
      : `ok (${result.updatedRates} updated)`;
  log.info('job.currency_rate_sync.done', { status });

  for (const issue of result.issues) {
    log.warn('job.currency_rate_sync.skipped', {
      from: issue.fromCurrency,
      to: issue.toCurrency,
      reason: issue.reason,
    });
  }
}
