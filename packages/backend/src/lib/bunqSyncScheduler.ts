import { HOUR_MS } from '../constants/time';
import { db } from '../db/client';
import { bunqConnections } from '../db/schema';
import { syncBunqSavings } from '../services/bunqSavingsSync';
import { syncBunqBudget } from '../services/bunqBudgetSync';

const SYNC_INTERVAL_HOURS = 1;
const SYNC_INTERVAL_MS = SYNC_INTERVAL_HOURS * HOUR_MS;

export function startBunqSyncScheduler(): void {
  console.log('[bunq-sync] Scheduler started, interval: 1h');

  setInterval(() => {
    void runSync();
  }, SYNC_INTERVAL_MS);
}

function formatSyncStatus(status: string, issues: Array<{ message: string }>): string {
  if (status === 'success') return 'ok';
  const details = issues.length > 0 ? `: ${issues[0]?.message}` : '';
  return `${status}${details}`;
}

async function syncUserAccounts(userId: number): Promise<void> {
  try {
    const savingsResult = await syncBunqSavings(userId);
    const budgetResult = await syncBunqBudget(userId);

    const savingsStatus = formatSyncStatus(savingsResult.status, savingsResult.issues);
    const budgetStatus = formatSyncStatus(budgetResult.status, budgetResult.issues);

    console.log(`[bunq-sync] userId=${userId} savings=${savingsStatus} budget=${budgetStatus}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[bunq-sync] userId=${userId} error: ${message}`);
  }
}

async function runSync(): Promise<void> {
  try {
    const connections = await db
      .selectDistinct({
        userId: bunqConnections.userId,
      })
      .from(bunqConnections);

    for (const { userId } of connections) {
      await syncUserAccounts(userId);
    }
  } catch (error) {
    console.error('[bunq-sync] Failed to run sync cycle:', error);
  }
}
