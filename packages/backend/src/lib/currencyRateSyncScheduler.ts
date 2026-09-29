import { DAY_MS } from '../constants/time';
import { syncCurrencyRates } from './currencyRateSync';
import { startIntervalJob } from './intervalJob';

const SYNC_INTERVAL_MS = DAY_MS;

export function startCurrencyRateSyncScheduler(): void {
  startIntervalJob({
    name: 'currency-rate-sync',
    intervalMs: SYNC_INTERVAL_MS,
    runOnStart: true,
    run: runSync,
  });
}

async function runSync(): Promise<void> {
  const result = await syncCurrencyRates();
  const status =
    result.issues.length > 0
      ? `partial (${result.updatedRates}/${result.requestedRates} updated)`
      : `ok (${result.updatedRates} updated)`;
  console.log(`[currency-rate-sync] status=${status}`);

  for (const issue of result.issues) {
    console.warn(
      `[currency-rate-sync] ${issue.fromCurrency}->${issue.toCurrency} skipped: ${issue.reason}`,
    );
  }
}
