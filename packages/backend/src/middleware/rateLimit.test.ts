import { afterEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { peerEnv } from '../test/peer';
import { createAttemptLimiter, createRateLimitChecker, signinRateLimit } from './rateLimit';
import { applyTestSettings } from '../test/config';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  applyTestSettings({ NODE_ENV: originalNodeEnv });
});

describe('createRateLimitChecker', () => {
  it('limits repeated attempts for one key independently of other keys', () => {
    applyTestSettings({ NODE_ENV: 'development' });
    const isRateLimited = createRateLimitChecker(60_000, 2);

    expect(isRateLimited('victim@example.com')).toBe(false);
    expect(isRateLimited('other@example.com')).toBe(false);
    expect(isRateLimited('victim@example.com')).toBe(false);
    expect(isRateLimited('victim@example.com')).toBe(true);
  });

  it('is disabled in the test environment', () => {
    applyTestSettings({ NODE_ENV: 'test' });
    const isRateLimited = createRateLimitChecker(60_000, 1);

    expect(isRateLimited('victim@example.com')).toBe(false);
    expect(isRateLimited('victim@example.com')).toBe(false);
  });
});

describe('createAttemptLimiter', () => {
  it('refuses a reservation once the budget is used, per key', () => {
    applyTestSettings({ NODE_ENV: 'development' });
    const limiter = createAttemptLimiter(60_000, 2);

    expect(limiter.reserve('victim@example.com')).not.toBeNull();
    expect(limiter.reserve('victim@example.com')).not.toBeNull();
    expect(limiter.reserve('victim@example.com')).toBeNull();
    expect(limiter.reserve('other@example.com')).not.toBeNull();
  });

  it('gives a refunded attempt back without forgiving the others', () => {
    applyTestSettings({ NODE_ENV: 'development' });
    const limiter = createAttemptLimiter(60_000, 2);

    const failed = limiter.reserve('victim@example.com');
    const succeeded = limiter.reserve('victim@example.com');
    expect(failed).not.toBeNull();
    expect(limiter.reserve('victim@example.com')).toBeNull();

    succeeded!.refund();
    // A second refund of the same attempt must not release another one.
    succeeded!.refund();
    expect(limiter.reserve('victim@example.com')).not.toBeNull();
    expect(limiter.reserve('victim@example.com')).toBeNull();
  });

  it('keeps attempts that are still running inside the budget', () => {
    applyTestSettings({ NODE_ENV: 'development' });
    const limiter = createAttemptLimiter(60_000, 3);

    // Reservations made before any outcome is known, typically within one millisecond.
    const running = Array.from({ length: 5 }, () => limiter.reserve('victim@example.com'));
    expect(running.filter(Boolean)).toHaveLength(3);

    // Refunding one in-flight attempt frees exactly one place.
    running[0]!.refund();
    expect(limiter.reserve('victim@example.com')).not.toBeNull();
    expect(limiter.reserve('victim@example.com')).toBeNull();
  });

  it('counts nothing in the test environment', () => {
    applyTestSettings({ NODE_ENV: 'test' });
    const limiter = createAttemptLimiter(60_000, 1);

    expect(limiter.reserve('victim@example.com')).not.toBeNull();
    expect(limiter.reserve('victim@example.com')).not.toBeNull();
  });
});

describe('rate limiter client addressing', () => {
  function signinFrom(peer: string | undefined, headers: Record<string, string> = {}) {
    const app = new Hono();
    app.post('/signin', signinRateLimit, (c) => c.json({ ok: true }));
    return app.request('/signin', { method: 'POST', headers }, peer ? peerEnv(peer) : undefined);
  }

  it('does not let an untrusted client rotate X-Real-IP to dodge the limit', async () => {
    applyTestSettings({ NODE_ENV: 'development' });
    const peer = '198.51.100.20';
    for (let i = 0; i < 5; i += 1) {
      expect((await signinFrom(peer, { 'x-real-ip': `192.0.2.${i}` })).status).toBe(200);
    }
    expect((await signinFrom(peer, { 'x-real-ip': '192.0.2.99' })).status).toBe(429);
  });

  it('fails closed instead of sharing a bucket when the peer is unknown', async () => {
    applyTestSettings({ NODE_ENV: 'development' });
    const response = await signinFrom(undefined, { 'x-real-ip': '192.0.2.1' });
    expect(response.status).toBe(503);
  });
});
