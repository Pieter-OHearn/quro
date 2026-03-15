import { createMiddleware } from 'hono/factory';
import { HTTP_STATUS } from '../constants/http';

function createRateLimiter(windowMs: number, max: number) {
  const store = new Map<string, number[]>();

  return createMiddleware(async (c, next) => {
    if (process.env.NODE_ENV === 'test') {
      await next();
      return;
    }

    const ip =
      c.req.header('x-real-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';

    const now = Date.now();
    const hits = (store.get(ip) ?? []).filter((t) => t > now - windowMs);

    if (hits.length >= max) {
      return c.json(
        { error: 'Too many requests, please try again later' },
        HTTP_STATUS.TOO_MANY_REQUESTS,
      );
    }

    hits.push(now);
    store.set(ip, hits);

    await next();
  });
}

const ONE_MINUTE_MS = 60_000;
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;
const SIGNIN_MAX_ATTEMPTS = 5;
const SIGNUP_MAX_ATTEMPTS = 3;

export const signinRateLimit = createRateLimiter(ONE_MINUTE_MS, SIGNIN_MAX_ATTEMPTS);
export const signupRateLimit = createRateLimiter(FIFTEEN_MINUTES_MS, SIGNUP_MAX_ATTEMPTS);
