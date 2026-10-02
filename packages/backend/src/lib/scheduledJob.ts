import { eq } from 'drizzle-orm';
import { db, queryClient } from '../db/client';
import { workerHeartbeats } from '../db/schema';

// A reserved connection holds a session lock across external I/O without a
// long-running transaction. PostgreSQL releases it if the process dies.
export async function runScheduledJob(
  name: string,
  intervalMs: number,
  run: () => Promise<void>,
): Promise<void> {
  const connection = await queryClient.reserve();
  const key = `scheduler:${name}`;
  let acquired = false;
  try {
    const [lock] = await connection<{ acquired: boolean }[]>`
      select pg_try_advisory_lock(hashtext(${key})) as acquired`;
    if (!lock?.acquired) return;
    acquired = true;
    const [lastRun] = await db
      .select()
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.workerName, key));
    if (lastRun && Date.now() - lastRun.lastHeartbeatAt.getTime() < intervalMs) return;
    await run();
    const now = new Date();
    await db
      .insert(workerHeartbeats)
      .values({
        workerName: key,
        status: 'idle',
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: workerHeartbeats.workerName,
        set: { status: 'idle', lastHeartbeatAt: now, updatedAt: now },
      });
  } finally {
    try {
      if (acquired) await connection`select pg_advisory_unlock(hashtext(${key}))`;
    } finally {
      connection.release();
    }
  }
}
