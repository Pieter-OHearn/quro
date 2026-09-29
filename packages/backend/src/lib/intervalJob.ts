import { HOUR_MS } from '../constants/time';

export type IntervalJobOptions = {
  // Log prefix, e.g. 'bunq-sync'.
  name: string;
  intervalMs: number;
  // Also run once immediately at startup.
  runOnStart: boolean;
  run: () => Promise<void>;
};

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';
}

// Start a recurring background job. Does nothing under test so importing an
// app module never leaves timers running. A cycle that throws is logged and
// never stops later cycles; cycles run detached from the caller.
export function startIntervalJob(options: Readonly<IntervalJobOptions>): void {
  if (isTestEnvironment()) return;

  const { name, intervalMs, runOnStart, run } = options;
  const runSafely = async (): Promise<void> => {
    try {
      await run();
    } catch (error) {
      console.error(`[${name}] Failed to run cycle:`, error);
    }
  };

  console.log(`[${name}] Scheduler started, interval: ${intervalMs / HOUR_MS}h`);
  setInterval(() => void runSafely(), intervalMs);
  if (runOnStart) void runSafely();
}
