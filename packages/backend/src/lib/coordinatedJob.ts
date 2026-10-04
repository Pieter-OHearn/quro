import { checkWorkDeadline, SCHEDULED_JOB_TIMEOUT_MS, withWorkDeadline } from './workDeadline';

export type JobLease = {
  acquire: () => Promise<boolean>;
  lastSuccess: () => Promise<Date | null>;
  recordSuccess: () => Promise<void>;
  unlock: () => Promise<void>;
  release: () => void;
};

export async function runCoordinatedJob(
  reserve: () => Promise<JobLease>,
  intervalMs: number,
  run: () => Promise<void>,
  timeoutMs = SCHEDULED_JOB_TIMEOUT_MS,
): Promise<void> {
  const lease = await reserve();
  let acquired = false;
  try {
    acquired = await lease.acquire();
    if (!acquired) return;
    // Do not race the application callback: all writes finish before unlock.
    await withWorkDeadline(timeoutMs, async () => {
      const lastRun = await lease.lastSuccess();
      if (lastRun && Date.now() - lastRun.getTime() < intervalMs) return;
      await run();
      checkWorkDeadline();
      await lease.recordSuccess();
    });
  } finally {
    try {
      if (acquired) await lease.unlock();
    } finally {
      lease.release();
    }
  }
}
