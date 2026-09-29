import { afterEach, describe, expect, test } from 'bun:test';
import { startIntervalJob } from './intervalJob';

describe('startIntervalJob', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBunEnv = process.env.BUN_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalBunEnv === undefined) delete process.env.BUN_ENV;
    else process.env.BUN_ENV = originalBunEnv;
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
    process.env.NODE_ENV = 'production';
    delete process.env.BUN_ENV;
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
});
