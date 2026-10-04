import { eq } from 'drizzle-orm';
import { db, createQueryClient } from '../db/client';
import { getRuntimeDatabaseUrl } from '../db/config';
import { workerHeartbeats } from '../db/schema';
import { runCoordinatedJob, type JobLease } from './coordinatedJob';
import { DEADLINE_GRACE_MS, UPSTREAM_TIMEOUT_MS, SCHEDULED_JOB_TIMEOUT_MS } from './workDeadline';

const STATEMENT_TIMEOUT_GRACE_DIVISOR = 2;

// A reserved connection holds a session lock across external I/O without a
// long-running transaction. PostgreSQL releases it if the process dies.
export function runScheduledJob(
  name: string,
  intervalMs: number,
  run: () => Promise<void>,
  timeoutMs = SCHEDULED_JOB_TIMEOUT_MS,
  graceMs = DEADLINE_GRACE_MS,
): Promise<void> {
  return runCoordinatedJob(() => reserveLease(name, graceMs), intervalMs, run, timeoutMs, graceMs);
}

async function reserveLease(name: string, graceMs: number): Promise<JobLease> {
  // All application queries in this scope use this disposable pool. Server
  // statement timeouts fit inside the cleanup grace period even if cancel fails.
  const pool = createQueryClient(getRuntimeDatabaseUrl(), {
    connection: {
      statement_timeout: Math.min(
        UPSTREAM_TIMEOUT_MS,
        Math.max(1, Math.floor(graceMs / STATEMENT_TIMEOUT_GRACE_DIVISOR)),
      ),
    },
    connect_timeout: 10,
    max: 5,
  });
  let connection;
  try {
    connection = await pool.reserve();
  } catch (error) {
    await pool.end({ timeout: 0 });
    throw error;
  }
  const key = `scheduler:${name}`;
  return {
    database: pool,
    destroy: () => pool.end({ timeout: 0 }),
    close: () => pool.end({ timeout: 0 }),
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
