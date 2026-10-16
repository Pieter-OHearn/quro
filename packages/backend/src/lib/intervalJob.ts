import { isTestEnvironment } from '../config';
import { HOUR_MS, MINUTE_MS, MS_PER_SECOND } from '../constants/time';
import { log, errorFields } from './logger';
import { runUnlessMaintenance, type MaintenanceOutcome } from './maintenanceMode';
import { recordJobFailure } from './jobStatus';
import { runScheduledJob } from './scheduledJob';

type MaintenanceGate = (work: () => Promise<void>) => Promise<MaintenanceOutcome<void>>;

type IntervalJobOptions = {
  // Log prefix, e.g. 'bunq-sync'.
  name: string;
  intervalMs: number;
  // Also run once immediately at startup.
  runOnStart: boolean;
  coordinated?: boolean;
  run: () => Promise<void>;
  // Holds back a cycle while maintenance mode is on; replaced in tests.
  gate?: MaintenanceGate;
};

const RETRY_BASE_MS = MINUTE_MS;
const MAX_BACKOFF_DOUBLINGS = 16;

/**
 * How long to wait after the nth failed cycle in a row before the next attempt: a minute, doubling
 * with each failure, and never longer than the job's own interval. A provider that is down is asked
 * a handful of times an hour, not every poll, and the job still retries without anyone's help.
 */
export function retryDelayMs(consecutiveFailures: number, intervalMs: number): number {
  if (consecutiveFailures <= 0) return 0;
  const doublings = Math.min(consecutiveFailures - 1, MAX_BACKOFF_DOUBLINGS);
  return Math.min(intervalMs, RETRY_BASE_MS * 2 ** doublings);
}

const timers = new Set<ReturnType<typeof setInterval>>();
const runningCycles = new Set<Promise<void>>();
let stopping = false;

// Start a recurring background job. Does nothing under test so importing an
// app module never leaves timers running. A cycle that throws is logged and
// never stops later cycles, and a tick is skipped while the previous cycle is
// still running or while a backup or restore holds maintenance mode. Cycles run
// detached from the caller; `stopIntervalJobs` waits for them on shutdown.
export function startIntervalJob(options: Readonly<IntervalJobOptions>): void {
  if (isTestEnvironment()) return;

  const { name, intervalMs, runOnStart, run, gate = runUnlessMaintenance } = options;
  let running = false;
  let failures = 0;
  let retryAt = 0;
  const cycle = async (): Promise<void> => {
    const outcome = await gate(() =>
      options.coordinated ? runScheduledJob(name, intervalMs, run) : run(),
    );
    if (!outcome.ran) log.info('job.paused_for_maintenance', { job: name });
  };
  const runSafely = async (): Promise<void> => {
    if (stopping) return;
    if (Date.now() < retryAt) return;
    if (running) {
      log.warn('job.cycle_skipped_still_running', { job: name });
      return;
    }
    running = true;
    const pending = cycle()
      .then(() => {
        failures = 0;
        retryAt = 0;
      })
      .catch((error: unknown) => {
        failures += 1;
        const delayMs = retryDelayMs(failures, intervalMs);
        retryAt = Date.now() + delayMs;
        log.error('job.cycle_failed', {
          job: name,
          consecutiveFailures: failures,
          retryInSeconds: Math.round(delayMs / MS_PER_SECOND),
          ...errorFields(error),
        });
        return recordJobFailure(name);
      })
      .finally(() => {
        running = false;
        runningCycles.delete(pending);
      });
    runningCycles.add(pending);
    await pending;
  };

  log.info('job.scheduler_started', { job: name, intervalHours: intervalMs / HOUR_MS });
  const pollMs = options.coordinated ? Math.min(intervalMs, MINUTE_MS) : intervalMs;
  timers.add(setInterval(() => void runSafely(), pollMs));
  if (runOnStart) void runSafely();
}

/** Starts no further cycles and waits for the running ones to finish (graceful shutdown). */
export async function stopIntervalJobs(): Promise<void> {
  stopping = true;
  for (const timer of timers) clearInterval(timer);
  timers.clear();
  await Promise.allSettled([...runningCycles]);
}

/** The number of job cycles running now. */
export function runningIntervalJobs(): number {
  return runningCycles.size;
}
