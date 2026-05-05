import { db } from '../db/client';
import { holdings } from '../db/schema';
import { syncHoldingPricesForUser } from './holdingPriceSync';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_SECOND = 1000;
const SYNC_INTERVAL_HOURS = 24;
const SYNC_INTERVAL_MS =
  SYNC_INTERVAL_HOURS * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

export function startHoldingPriceSyncScheduler(): void {
  console.log('[holding-price-sync] Scheduler started, interval: 24h');

  setInterval(() => {
    void runSync();
  }, SYNC_INTERVAL_MS);

  // Run immediately on startup
  void runSync();
}

async function syncUserHoldings(userId: number): Promise<void> {
  try {
    const result = await syncHoldingPricesForUser(userId);
    const status =
      result.summary.issues.length > 0
        ? `partial (${result.summary.updatedHoldings}/${result.summary.requestedHoldings} updated)`
        : `ok (${result.summary.updatedHoldings} updated)`;
    console.log(`[holding-price-sync] userId=${userId} status=${status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[holding-price-sync] userId=${userId} error: ${message}`);
  }
}

async function runSync(): Promise<void> {
  try {
    const users = await db
      .selectDistinct({
        userId: holdings.userId,
      })
      .from(holdings);

    if (users.length === 0) {
      console.log('[holding-price-sync] No users with holdings found');
      return;
    }

    console.log(`[holding-price-sync] Starting sync for ${users.length} users`);
    for (const { userId } of users) {
      await syncUserHoldings(userId!);
    }
  } catch (error) {
    console.error('[holding-price-sync] Failed to run sync cycle:', error);
  }
}
