import { DAY_MS } from '../constants/time';
import { db } from '../db/client';
import { users } from '../db/schema';
import { startIntervalJob } from './intervalJob';
import { upsertCurrentNetWorthSnapshot } from './netWorth';

const SNAPSHOT_INTERVAL_MS = DAY_MS;

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
  const userRows = await db.select({ userId: users.id }).from(users);
  console.log(`[net-worth-snapshot] Starting snapshots for ${userRows.length} users`);
  for (const { userId } of userRows) await snapshotUser(userId);
}

export function startNetWorthSnapshotScheduler(): void {
  startIntervalJob({
    name: 'net-worth-snapshot',
    intervalMs: SNAPSHOT_INTERVAL_MS,
    runOnStart: true,
    run: runSnapshots,
  });
}
