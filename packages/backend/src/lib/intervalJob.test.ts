import { afterEach, describe, expect, test } from 'bun:test';
import { startIntervalJob, stopIntervalJobs } from './intervalJob';
import type { MaintenanceOutcome } from './maintenanceMode';
import { applyTestSettings } from '../test/config';

// The real gate asks the database whether maintenance mode is on; these tests decide it.
async function open(work: () => Promise<void>): Promise<MaintenanceOutcome<void>> {
  return { ran: true, value: await work() };
}
const closed = () => Promise.resolve({ ran: false } as const);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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
      expect(logs).toContain('[test-job] Paused while a backup or restore runs');
      maintenance = false;
      tick();
      await settle();
      expect(calls).toBe(1);
    } finally {
      globalThis.setInterval = realSetInterval;
      console.log = originalLog;
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
