import { DAY_MS } from '../constants/time';
import { db } from '../db/client';
import { sql, eq } from 'drizzle-orm';
import { partnerLinks } from '../db/schema';
import { getCurrentRatesToBaseCurrency } from './currencyRateSync';
import { forEachConcurrent } from './concurrency';
import { startIntervalJob } from './intervalJob';
import { upsertCurrentNetWorthSnapshot } from './netWorth';

const SNAPSHOT_INTERVAL_MS = DAY_MS;
const SNAPSHOT_CONCURRENCY = 4;

async function snapshotUser(
  userId: number,
  rates: Map<string, number>,
  partnerId: number | null,
): Promise<void> {
  try {
    await upsertCurrentNetWorthSnapshot(userId, new Date(), { rates, partnerId });
    console.log(`[net-worth-snapshot] userId=${userId} status=ok`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[net-worth-snapshot] userId=${userId} error: ${message}`);
  }
}

export async function runSnapshots(): Promise<void> {
  const [rates, links, owners] = await Promise.all([
    getCurrentRatesToBaseCurrency(),
    db.select().from(partnerLinks).where(eq(partnerLinks.status, 'accepted')),
    db.execute<{ user_id: number }>(sql`
      select user_id from savings_accounts where archived_at is null
      union select user_id from holdings where archived_at is null
      union select user_id from properties where archived_at is null
      union select user_id from pension_pots where archived_at is null
      union select user_id from debts where archived_at is null
      union select user_id from mortgages where archived_at is null
    `),
  ]);
  const partners = new Map<number, number>();
  const userIds = new Set(owners.map((row) => row.user_id));
  for (const link of links) {
    partners.set(link.requesterId, link.addresseeId);
    partners.set(link.addresseeId, link.requesterId);
    if (userIds.has(link.requesterId) || userIds.has(link.addresseeId)) {
      userIds.add(link.requesterId);
      userIds.add(link.addresseeId);
    }
  }
  console.log(`[net-worth-snapshot] Starting snapshots for ${userIds.size} users`);
  await forEachConcurrent([...userIds], SNAPSHOT_CONCURRENCY, (userId) =>
    snapshotUser(userId, rates, partners.get(userId) ?? null),
  );
}

export function startNetWorthSnapshotScheduler(): void {
  startIntervalJob({
    coordinated: true,
    name: 'net-worth-snapshot',
    intervalMs: SNAPSHOT_INTERVAL_MS,
    runOnStart: true,
    run: runSnapshots,
  });
}
