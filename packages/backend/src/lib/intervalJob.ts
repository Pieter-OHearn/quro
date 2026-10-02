import { HOUR_MS, MINUTE_MS } from '../constants/time';
import { runScheduledJob } from './scheduledJob';

type IntervalJobOptions = {
  // Log prefix, e.g. 'bunq-sync'.
  name: string;
  intervalMs: number;
  // Also run once immediately at startup.
  runOnStart: boolean;
  coordinated?: boolean;
  run: () => Promise<void>;
};

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';
}

// Start a recurring background job. Does nothing under test so importing an
// app module never leaves timers running. A cycle that throws is logged and
// never stops later cycles, and a tick is skipped while the previous cycle is
// still running. Cycles run detached from the caller.
export function startIntervalJob(options: Readonly<IntervalJobOptions>): void {
  if (isTestEnvironment()) return;

  const { name, intervalMs, runOnStart, run } = options;
  let running = false;
  const runSafely = async (): Promise<void> => {
    if (running) {
      console.warn(`[${name}] Previous cycle still running, skipping`);
      return;
    }
    running = true;
    try {
      if (options.coordinated) await runScheduledJob(name, intervalMs, run);
      else await run();
    } catch (error) {
      console.error(`[${name}] Failed to run cycle:`, error);
    } finally {
      running = false;
    }
  };

  console.log(`[${name}] Scheduler started, interval: ${intervalMs / HOUR_MS}h`);
  const pollMs = options.coordinated ? Math.min(intervalMs, MINUTE_MS) : intervalMs;
  setInterval(() => void runSafely(), pollMs);
  if (runOnStart) void runSafely();
}
