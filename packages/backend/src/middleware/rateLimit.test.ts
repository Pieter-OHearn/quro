import { describe, expect, jest, test } from 'bun:test';
import { Hono } from 'hono';
import { createRateLimiter } from './rateLimit';

const makeApp = (limiter: ReturnType<typeof createRateLimiter>) => {
  const app = new Hono();
  app.use('*', limiter);
  app.get('/', (c) => c.json({ ok: true }));
  return app;
};

describe('createRateLimiter', () => {
  test('blocks requests once max is reached within the window', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const app = makeApp(createRateLimiter(60_000, 2));
      const headers = { 'x-real-ip': '1.1.1.1' };

      expect((await app.request('/', { headers })).status).toBe(200);
      expect((await app.request('/', { headers })).status).toBe(200);
      expect((await app.request('/', { headers })).status).toBe(429);
    } finally {
      process.env.NODE_ENV = originalEnv;
      jest.useRealTimers();
    }
  });

  test('evicts stale entries after one full window so the IP can make requests again', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const windowMs = 100;
      const app = makeApp(createRateLimiter(windowMs, 2));
      const headers = { 'x-real-ip': '2.2.2.2' };

      await app.request('/', { headers });
      await app.request('/', { headers });
      expect((await app.request('/', { headers })).status).toBe(429);

      // Advance past one full window — the cleanup interval fires and evicts the entry
      jest.advanceTimersByTime(windowMs + 1);

      expect((await app.request('/', { headers })).status).toBe(200);
    } finally {
      process.env.NODE_ENV = originalEnv;
      jest.useRealTimers();
    }
  });

  // setSystemTime moves Date.now() without firing the interval scheduler, so the cleanup
  // callback never runs here — confirming that hits within the window are still counted.
  test('hits made within the window still count before the cleanup interval fires', async () => {
    const T0 = 2_000_000;
    jest.useFakeTimers();
    jest.setSystemTime(T0);

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const windowMs = 100;
      const app = makeApp(createRateLimiter(windowMs, 2));
      const headers = { 'x-real-ip': '3.3.3.3' };

      await app.request('/', { headers });
      await app.request('/', { headers });
      expect((await app.request('/', { headers })).status).toBe(429);

      // Jump Date.now() to 1ms before expiry without advancing the timer schedule
      jest.setSystemTime(T0 + windowMs - 1);

      // Hits from T0 are still inside the window — request stays blocked
      expect((await app.request('/', { headers })).status).toBe(429);
    } finally {
      process.env.NODE_ENV = originalEnv;
      jest.useRealTimers();
    }
  });
});
