import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { retryDelayMs, startIntervalJob, stopIntervalJobs } from './intervalJob';
import type { MaintenanceOutcome } from './maintenanceMode';
import { applyTestSettings } from '../test/config';

// The real gate asks the database whether maintenance mode is on; these tests decide it.
async function open(work: () => Promise<void>): Promise<MaintenanceOutcome<void>> {
  return { ran: true, value: await work() };
}
const closed = () => Promise.resolve({ ran: false } as const);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
// A failed cycle also records the failure in the database before it counts as finished.
const settleFailureRecord = () => new Promise((resolve) => setTimeout(resolve, 150));

describe('startIntervalJob', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    applyTestSettings({ NODE_ENV: originalNodeEnv });
  });

  test('does nothing under test so no timers or startup runs are created', () => {
    let calls = 0;
    startIntervalJob({
      name: 'test-job',
      intervalMs: 1,
      runOnStart: true,
      run: () => {
        calls += 1;
        return Promise.resolve();
      },
    });
    expect(calls).toBe(0);
  });

  test('runs once on start outside test and swallows failures', async () => {
    applyTestSettings({ NODE_ENV: 'production' });
    const originalLog = console.log;
    const originalError = console.error;
    const errors: unknown[][] = [];
    console.log = () => {};
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    const realSetInterval = globalThis.setInterval;
    let registeredMs = 0;
    globalThis.setInterval = ((_fn: () => void, ms: number) => {
      registeredMs = ms;
      return 0;
    }) as unknown as typeof setInterval;

    try {
      let calls = 0;
      startIntervalJob({
        name: 'test-job',
        intervalMs: 5000,
        runOnStart: true,
        gate: open,
        run: () => {
          calls += 1;
          return Promise.reject(new Error('boom'));
        },
      });
      await settle();
      expect(registeredMs).toBe(5000);
      expect(calls).toBe(1);
      expect(errors).toHaveLength(1);
    } finally {
      globalThis.setInterval = realSetInterval;
      console.log = originalLog;
      console.error = originalError;
    }
  });

  test('skips a tick while the previous cycle is still running', async () => {
    applyTestSettings({ NODE_ENV: 'production' });
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    const realSetInterval = globalThis.setInterval;
    let tick: () => void = () => {};
    globalThis.setInterval = ((fn: () => void) => {
      tick = fn;
      return 0;
    }) as unknown as typeof setInterval;

    try {
      let calls = 0;
      let finish: () => void = () => {};
      startIntervalJob({
        name: 'test-job',
        intervalMs: 1000,
        runOnStart: false,
        gate: open,
        run: () => {
          calls += 1;
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
      });
      tick();
      tick();
      expect(calls).toBe(1);
      finish();
      await settle();
      tick();
      expect(calls).toBe(2);
      finish();
      await settle();
    } finally {
      globalThis.setInterval = realSetInterval;
      console.log = originalLog;
      console.warn = originalWarn;
    }
  });

  test('skips the cycle while maintenance mode is on and runs the next one', async () => {
    applyTestSettings({ NODE_ENV: 'production' });
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (line: string) => logs.push(line);
    const realSetInterval = globalThis.setInterval;
    let tick: () => void = () => {};
    globalThis.setInterval = ((fn: () => void) => {
      tick = fn;
      return 0;
    }) as unknown as typeof setInterval;
    let maintenance = true;
    try {
      let calls = 0;
      startIntervalJob({
        name: 'test-job',
        intervalMs: 1000,
        runOnStart: true,
        gate: (work) => (maintenance ? closed() : open(work)),
        run: () => {
          calls += 1;
          return Promise.resolve();
        },
      });
      await settle();
      expect(calls).toBe(0);
      expect(logs.some((line) => line.includes('job.paused_for_maintenance'))).toBe(true);
      maintenance = false;
      tick();
      await settle();
      expect(calls).toBe(1);
    } finally {
      globalThis.setInterval = realSetInterval;
      console.log = originalLog;
    }
  });

  test('a failing job is not retried at every poll: it backs off, then recovers on a success', async () => {
    applyTestSettings({ NODE_ENV: 'production' });
    const quiet = spyOn(console, 'error').mockImplementation(() => {});
    spyOn(console, 'log').mockImplementation(() => {});
    const realSetInterval = globalThis.setInterval;
    let tick: () => void = () => {};
    globalThis.setInterval = ((fn: () => void) => {
      tick = fn;
      return 0;
    }) as unknown as typeof setInterval;
    let clock = Date.now();
    const now = spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      let calls = 0;
      let failing = true;
      startIntervalJob({
        name: 'backoff-job',
        intervalMs: 3_600_000,
        runOnStart: false,
        gate: open,
        run: () => {
          calls += 1;
          return failing ? Promise.reject(new Error('down')) : Promise.resolve();
        },
      });
      tick();
      await settleFailureRecord();
      expect(calls).toBe(1);
      clock += 30_000; // inside the first minute of backoff
      tick();
      await settleFailureRecord();
      expect(calls).toBe(1);
      clock += 31_000;
      tick();
      await settleFailureRecord();
      expect(calls).toBe(2);
      clock += 61_000; // the second failure waits two minutes
      tick();
      await settleFailureRecord();
      expect(calls).toBe(2);
      failing = false;
      clock += 61_000;
      tick();
      await settleFailureRecord();
      expect(calls).toBe(3);
      clock += 1;
      tick();
      await settleFailureRecord();
      expect(calls).toBe(4); // recovered: no backoff left
      expect(quiet).toHaveBeenCalled();
    } finally {
      now.mockRestore();
      quiet.mockRestore();
      globalThis.setInterval = realSetInterval;
    }
  });

  // Last: stopping is final for the process, as it is on shutdown.
  test('on shutdown, waits for the running cycle and starts no other', async () => {
    applyTestSettings({ NODE_ENV: 'production' });
    const originalLog = console.log;
    console.log = () => {};
    const realSetInterval = globalThis.setInterval;
    const realClearInterval = globalThis.clearInterval;
    let tick: () => void = () => {};
    const cleared: unknown[] = [];
    globalThis.setInterval = ((fn: () => void) => {
      tick = fn;
      return 42;
    }) as unknown as typeof setInterval;
    globalThis.clearInterval = ((timer: unknown) => {
      cleared.push(timer);
    }) as typeof clearInterval;
    try {
      let calls = 0;
      let finish: () => void = () => {};
      startIntervalJob({
        name: 'test-job',
        intervalMs: 1000,
        runOnStart: true,
        gate: open,
        run: () => {
          calls += 1;
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
      });
      let stopped = false;
      const stopping = stopIntervalJobs().then(() => {
        stopped = true;
      });
      await settle();
      expect(stopped).toBe(false);
      expect(cleared).toContain(42);
      finish();
      await stopping;
      expect(stopped).toBe(true);
      tick();
      await settle();
      expect(calls).toBe(1);
    } finally {
      globalThis.setInterval = realSetInterval;
      globalThis.clearInterval = realClearInterval;
      console.log = originalLog;
    }
  });
});

describe('retryDelayMs', () => {
  test('doubles from a minute after each failure in a row and never exceeds the interval', () => {
    const DAY = 86_400_000;
    expect([0, 1, 2, 3, 4].map((n) => retryDelayMs(n, DAY))).toEqual([
      0, 60_000, 120_000, 240_000, 480_000,
    ]);
    expect(retryDelayMs(50, DAY)).toBe(DAY);
    expect(retryDelayMs(3, 90_000)).toBe(90_000);
  });
});
