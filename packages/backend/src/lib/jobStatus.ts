import { db } from '../db/client';
import { workerHeartbeats } from '../db/schema';
import { JOB_FAILURE_PREFIX } from './operationalStatus';

/**
 * Records that a cycle of the job failed, as a time and nothing else: the row holds no message.
 * Best effort: a database outage must not hide the failure, which is already logged.
 */
export async function recordJobFailure(name: string): Promise<void> {
  const now = new Date();
  try {
    await db
      .insert(workerHeartbeats)
      .values({
        workerName: `${JOB_FAILURE_PREFIX}${name}`,
        status: 'failed',
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: workerHeartbeats.workerName,
        set: { status: 'failed', lastHeartbeatAt: now, updatedAt: now },
      });
  } catch {
    // Already logged by the caller.
  }
}
