import { createMiddleware } from 'hono/factory';
import { getConnInfo } from 'hono/bun';
import type { Context } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { parseTrustedProxies, resolveClientAddress } from '../lib/clientAddress';

const trustedProxies = parseTrustedProxies(process.env.TRUSTED_PROXIES);

function peerAddressOf(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

export function getClientAddress(c: Context): string | null {
  return resolveClientAddress({
    peerAddress: peerAddressOf(c),
    realIp: c.req.header('x-real-ip'),
    forwardedFor: c.req.header('x-forwarded-for'),
    proxies: trustedProxies,
  });
}

export function createRateLimitChecker(windowMs: number, max: number) {
  const store = new Map<string, number[]>();

  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, hits] of store.entries()) {
      if (hits.every((t) => t <= cutoff)) store.delete(key);
    }
  }, windowMs);

  if (cleanup.unref) cleanup.unref();

  return (key: string): boolean => {
    if (process.env.NODE_ENV === 'test') return false;

    const now = Date.now();
    const hits = (store.get(key) ?? []).filter((t) => t > now - windowMs);

    if (hits.length >= max) return true;

    hits.push(now);
    store.set(key, hits);
    return false;
  };
}

function createRateLimiter(windowMs: number, max: number) {
  const isRateLimited = createRateLimitChecker(windowMs, max);

  return createMiddleware(async (c, next) => {
    if (process.env.NODE_ENV === 'test') return next();

    const ip = getClientAddress(c);

    // Never share one bucket between clients whose address is unknown: fail closed instead.
    if (!ip) {
      return c.json(
        { error: 'Unable to determine client address' },
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
    }

    if (isRateLimited(ip)) {
      return c.json(
        { error: 'Too many requests, please try again later' },
        HTTP_STATUS.TOO_MANY_REQUESTS,
      );
    }

    await next();
  });
}

const ONE_MINUTE_MS = 60_000;
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS;
const SIGNIN_MAX_ATTEMPTS = 5;
const SIGNUP_MAX_ATTEMPTS = 3;
const CHANGE_PASSWORD_MAX_ATTEMPTS = 5;
const SIGNIN_EMAIL_MAX_ATTEMPTS = 5;
const PARTNER_INVITE_MAX_ATTEMPTS = 10;

export const signinRateLimit = createRateLimiter(ONE_MINUTE_MS, SIGNIN_MAX_ATTEMPTS);
export const signupRateLimit = createRateLimiter(FIFTEEN_MINUTES_MS, SIGNUP_MAX_ATTEMPTS);
// This complements the IP limiter so rotating source addresses cannot bypass the
// attempt budget for one account. Like the other limiters, it is per process. Trade-off: anyone
// can burn an account's budget by failing sign-in for that email, locking the owner out until the
// window ends. That is accepted over allowing unbounded distributed guessing.
export const signinEmailRateLimit = createRateLimitChecker(
  FIFTEEN_MINUTES_MS,
  SIGNIN_EMAIL_MAX_ATTEMPTS,
);
export const partnerInviteRateLimit = createRateLimitChecker(
  FIFTEEN_MINUTES_MS,
  PARTNER_INVITE_MAX_ATTEMPTS,
);
export const changePasswordRateLimit = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  CHANGE_PASSWORD_MAX_ATTEMPTS,
);
