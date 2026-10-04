import {
  checkWorkDeadline,
  HardDeadlineError,
  SCHEDULED_JOB_TIMEOUT_MS,
  withWorkDeadline,
} from './workDeadline';

export type JobLease = {
  acquire: () => Promise<boolean>;
  lastSuccess: () => Promise<Date | null>;
  recordSuccess: () => Promise<void>;
  unlock: () => Promise<void>;
  release: () => void;
  database?: object;
  destroy?: () => Promise<void>;
  close?: () => Promise<void>;
};

export async function runCoordinatedJob(
  reserve: () => Promise<JobLease>,
  intervalMs: number,
  run: () => Promise<void>,
  timeoutMs = SCHEDULED_JOB_TIMEOUT_MS,
  graceMs?: number,
): Promise<void> {
  const lease = await reserve();
  let acquired = false;
  let destroyed = false;
  try {
    acquired = await lease.acquire();
    if (!acquired) return;
    // Graceful cleanup drains writes; hard cleanup destroys the isolated pool.
    await withWorkDeadline(
      timeoutMs,
      async () => {
        const lastRun = await lease.lastSuccess();
        if (lastRun && Date.now() - lastRun.getTime() < intervalMs) return;
        await run();
        checkWorkDeadline();
        await lease.recordSuccess();
      },
      {
        database: lease.database,
        graceMs,
        destroy: async () => {
          destroyed = true;
          await lease.destroy?.();
        },
      },
    );
  } catch (error) {
    destroyed ||= error instanceof HardDeadlineError;
    throw error;
  } finally {
    try {
      if (acquired && !destroyed) await lease.unlock();
    } finally {
      if (!destroyed) lease.release();
      await lease.close?.();
    }
  }
}
