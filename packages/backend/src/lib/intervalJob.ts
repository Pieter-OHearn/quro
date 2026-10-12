import { isTestEnvironment } from '../config';
import { HOUR_MS, MINUTE_MS } from '../constants/time';
import { runUnlessMaintenance, type MaintenanceOutcome } from './maintenanceMode';
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
  const cycle = async (): Promise<void> => {
    const outcome = await gate(() =>
      options.coordinated ? runScheduledJob(name, intervalMs, run) : run(),
    );
    if (!outcome.ran) console.log(`[${name}] Paused while a backup or restore runs`);
  };
  const runSafely = async (): Promise<void> => {
    if (stopping) return;
    if (running) {
      console.warn(`[${name}] Previous cycle still running, skipping`);
      return;
    }
    running = true;
    const pending = cycle()
      .catch((error: unknown) => console.error(`[${name}] Failed to run cycle:`, error))
      .finally(() => {
        running = false;
        runningCycles.delete(pending);
      });
    runningCycles.add(pending);
    await pending;
  };

  console.log(`[${name}] Scheduler started, interval: ${intervalMs / HOUR_MS}h`);
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
