import { HOUR_MS } from '../constants/time';
import { db } from '../db/client';
import { bunqConnections } from '../db/schema';
import { syncBunqSavings } from '../services/bunqSavingsSync';
import { syncBunqBudget } from '../services/bunqBudgetSync';
import { createRotatingWork } from './rotatingWork';
import { startIntervalJob } from './intervalJob';

const SYNC_INTERVAL_MS = HOUR_MS;
const rotateUsers = createRotatingWork();

export function startBunqSyncScheduler(): void {
  startIntervalJob({
    coordinated: true,
    name: 'bunq-sync',
    intervalMs: SYNC_INTERVAL_MS,
    runOnStart: false,
    run: runSync,
  });
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
  const connections = await db
    .selectDistinct({
      userId: bunqConnections.userId,
    })
    .from(bunqConnections);

  await rotateUsers(
    connections.map(({ userId }) => userId),
    syncUserAccounts,
  );
}
