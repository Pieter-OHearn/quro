import { afterEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { peerEnv } from '../test/peer';
import { createRateLimitChecker, signinRateLimit } from './rateLimit';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('createRateLimitChecker', () => {
  it('limits repeated attempts for one key independently of other keys', () => {
    process.env.NODE_ENV = 'development';
    const isRateLimited = createRateLimitChecker(60_000, 2);

    expect(isRateLimited('victim@example.com')).toBe(false);
    expect(isRateLimited('other@example.com')).toBe(false);
    expect(isRateLimited('victim@example.com')).toBe(false);
    expect(isRateLimited('victim@example.com')).toBe(true);
  });

  it('is disabled in the test environment', () => {
    process.env.NODE_ENV = 'test';
    const isRateLimited = createRateLimitChecker(60_000, 1);

    expect(isRateLimited('victim@example.com')).toBe(false);
    expect(isRateLimited('victim@example.com')).toBe(false);
  });
});

describe('rate limiter client addressing', () => {
  function signinFrom(peer: string | undefined, headers: Record<string, string> = {}) {
    const app = new Hono();
    app.post('/signin', signinRateLimit, (c) => c.json({ ok: true }));
    return app.request('/signin', { method: 'POST', headers }, peer ? peerEnv(peer) : undefined);
  }

  it('does not let an untrusted client rotate X-Real-IP to dodge the limit', async () => {
    process.env.NODE_ENV = 'development';
    const peer = '198.51.100.20';
    for (let i = 0; i < 5; i += 1) {
      expect((await signinFrom(peer, { 'x-real-ip': `192.0.2.${i}` })).status).toBe(200);
    }
    expect((await signinFrom(peer, { 'x-real-ip': '192.0.2.99' })).status).toBe(429);
  });

  it('fails closed instead of sharing a bucket when the peer is unknown', async () => {
    process.env.NODE_ENV = 'development';
    const response = await signinFrom(undefined, { 'x-real-ip': '192.0.2.1' });
    expect(response.status).toBe(503);
  });
});
