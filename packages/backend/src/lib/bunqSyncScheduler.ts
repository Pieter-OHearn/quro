import { db } from '../db/client';
import { bunqConnections } from '../db/schema';
import { syncBunqSavings } from '../services/bunqSavingsSync';
import { syncBunqBudget } from '../services/bunqBudgetSync';
import { createRotatingWork } from './rotatingWork';
import { JOB_INTERVAL_MS } from './operationalStatus';
import { describeSyncFailure } from './syncFailure';
import { startIntervalJob } from './intervalJob';
import { log, errorFields } from './logger';

const SYNC_INTERVAL_MS = JOB_INTERVAL_MS['bunq-sync'];
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

    log.info('job.bunq_sync.user', { userId, savings: savingsStatus, budget: budgetStatus });
  } catch (error) {
    // A failed statement's message repeats its parameters; describeSyncFailure withholds it.
    log.error('job.bunq_sync.user_failed', {
      userId,
      ...errorFields(error),
      detail: describeSyncFailure(error, 'database or unknown error'),
    });
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
