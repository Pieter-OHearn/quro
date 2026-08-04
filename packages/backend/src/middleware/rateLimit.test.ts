import { afterEach, describe, expect, it } from 'bun:test';
import { createRateLimitChecker } from './rateLimit';

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
