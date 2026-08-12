import { db } from '../db/client';
import { users } from '../db/schema';
import { upsertCurrentNetWorthSnapshot } from './netWorth';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_SECOND = 1000;
const SNAPSHOT_INTERVAL_HOURS = 24;
const SNAPSHOT_INTERVAL_MS =
  SNAPSHOT_INTERVAL_HOURS * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

async function snapshotUser(userId: number): Promise<void> {
  try {
    await upsertCurrentNetWorthSnapshot(userId);
    console.log(`[net-worth-snapshot] userId=${userId} status=ok`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[net-worth-snapshot] userId=${userId} error: ${message}`);
  }
}

async function runSnapshots(): Promise<void> {
  try {
    const userRows = await db.select({ userId: users.id }).from(users);
    console.log(`[net-worth-snapshot] Starting snapshots for ${userRows.length} users`);
    for (const { userId } of userRows) await snapshotUser(userId);
  } catch (error) {
    console.error('[net-worth-snapshot] Failed to run snapshot cycle:', error);
  }
}

export function startNetWorthSnapshotScheduler(): void {
  console.log('[net-worth-snapshot] Scheduler started, interval: 24h');
  setInterval(() => void runSnapshots(), SNAPSHOT_INTERVAL_MS);
  void runSnapshots();
}
