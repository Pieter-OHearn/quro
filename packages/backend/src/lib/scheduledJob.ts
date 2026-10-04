import { eq } from 'drizzle-orm';
import { db, queryClient } from '../db/client';
import { workerHeartbeats } from '../db/schema';
import { runCoordinatedJob, type JobLease } from './coordinatedJob';
import { SCHEDULED_JOB_TIMEOUT_MS } from './workDeadline';

// A reserved connection holds a session lock across external I/O without a
// long-running transaction. PostgreSQL releases it if the process dies.
export function runScheduledJob(
  name: string,
  intervalMs: number,
  run: () => Promise<void>,
  timeoutMs = SCHEDULED_JOB_TIMEOUT_MS,
): Promise<void> {
  return runCoordinatedJob(() => reserveLease(name), intervalMs, run, timeoutMs);
}

async function reserveLease(name: string): Promise<JobLease> {
  const connection = await queryClient.reserve();
  const key = `scheduler:${name}`;
  return {
    acquire: async () => {
      const [lock] = await connection<{ acquired: boolean }[]>`
        select pg_try_advisory_lock(hashtext(${key})) as acquired`;
      return Boolean(lock?.acquired);
    },
    lastSuccess: async () => {
      const [lastRun] = await db
        .select()
        .from(workerHeartbeats)
        .where(eq(workerHeartbeats.workerName, key));
      return lastRun?.lastHeartbeatAt ?? null;
    },
    recordSuccess: async () => {
      const now = new Date();
      await db
        .insert(workerHeartbeats)
        .values({ workerName: key, status: 'idle', lastHeartbeatAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: workerHeartbeats.workerName,
          set: { status: 'idle', lastHeartbeatAt: now, updatedAt: now },
        });
    },
    unlock: async () => {
      await connection`select pg_advisory_unlock(hashtext(${key}))`;
    },
    release: () => connection.release(),
  };
}
