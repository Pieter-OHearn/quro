import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from '../constants/time';
import { syncCurrencyRates } from './currencyRateSync';

const SYNC_INTERVAL_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

function shouldSkipScheduler(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';
}

export function startCurrencyRateSyncScheduler(): void {
  if (shouldSkipScheduler()) return;

  console.log('[currency-rate-sync] Scheduler started, interval: 24h');

  setInterval(() => {
    void runSync();
  }, SYNC_INTERVAL_MS);

  void runSync();
}

async function runSync(): Promise<void> {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[currency-rate-sync] Failed to run sync cycle: ${message}`);
  }
}
