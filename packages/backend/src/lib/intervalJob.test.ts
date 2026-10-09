import { afterEach, describe, expect, test } from 'bun:test';
import { startIntervalJob } from './intervalJob';
import { applyTestSettings } from '../test/config';

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
        run: () => {
          calls += 1;
          return Promise.reject(new Error('boom'));
        },
      });
      await Promise.resolve();
      await Promise.resolve();
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
      await Promise.resolve();
      await Promise.resolve();
      tick();
      expect(calls).toBe(2);
    } finally {
      globalThis.setInterval = realSetInterval;
      console.log = originalLog;
      console.warn = originalWarn;
    }
  });
});
