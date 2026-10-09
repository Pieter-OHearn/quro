import { createMiddleware } from 'hono/factory';
import { getConnInfo } from 'hono/bun';
import type { Context } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { getConfig, isTestEnvironment } from '../config';
import { resolveClientAddress, type TrustedProxies } from '../lib/clientAddress';

const trustedProxies = getConfig().web.trustedProxies;

function peerAddressOf(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

/** The rate-limit key for a request: its peer, or the client a trusted proxy forwarded. */
export function getClientAddress(c: Context, proxies: TrustedProxies = trustedProxies) {
  return resolveClientAddress({
    peerAddress: peerAddressOf(c),
    realIp: c.req.header('x-real-ip'),
    forwardedFor: c.req.header('x-forwarded-for'),
    proxies,
  });
}

/** An attempt counted against a key's budget. `refund` takes it back; calling it again does nothing. */
export type AttemptReservation = { refund: () => void };

const UNCOUNTED_ATTEMPT: AttemptReservation = { refund: () => {} };

/**
 * A sliding-window budget of `max` attempts per key. `reserve` counts an attempt and returns it, or
 * returns null when the key has no attempts left in the window. Reserving before the outcome is
 * known and refunding the attempts that should not count keeps concurrent requests within the
 * budget: each one holds its attempt while it runs.
 */
export function createAttemptLimiter(windowMs: number, max: number) {
  const store = new Map<string, number[]>();

  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, hits] of store.entries()) {
      if (hits.every((t) => t <= cutoff)) store.delete(key);
    }
  }, windowMs);

  if (cleanup.unref) cleanup.unref();

  function release(key: string, stamp: number) {
    const hits = store.get(key);
    if (!hits) return;
    // Attempts with the same timestamp are interchangeable, so removing any one of them is exact.
    const index = hits.lastIndexOf(stamp);
    if (index < 0) return;
    hits.splice(index, 1);
    if (hits.length === 0) store.delete(key);
  }

  return {
    reserve(key: string): AttemptReservation | null {
      if (isTestEnvironment()) return UNCOUNTED_ATTEMPT;

      const now = Date.now();
      const hits = (store.get(key) ?? []).filter((t) => t > now - windowMs);

      if (hits.length >= max) return null;

      hits.push(now);
      store.set(key, hits);

      let refunded = false;
      return {
        refund: () => {
          if (refunded) return;
          refunded = true;
          release(key, now);
        },
      };
    },
  };
}

export function createRateLimitChecker(windowMs: number, max: number) {
  const limiter = createAttemptLimiter(windowMs, max);
  return (key: string): boolean => limiter.reserve(key) === null;
}

function createRateLimiter(windowMs: number, max: number) {
  const isRateLimited = createRateLimitChecker(windowMs, max);

  return createMiddleware(async (c, next) => {
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
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const SIGNIN_EMAIL_MAX_ATTEMPTS = 5;
const PARTNER_INVITE_MAX_ATTEMPTS = 10;

export const signinRateLimit = createRateLimiter(ONE_MINUTE_MS, SIGNIN_MAX_ATTEMPTS);
export const signupRateLimit = createRateLimiter(FIFTEEN_MINUTES_MS, SIGNUP_MAX_ATTEMPTS);
// This complements the IP limiter so rotating source addresses cannot bypass the attempt budget
// for one account. Sign-in reserves an attempt before checking the password and refunds it only
// when the sign-in succeeds, so only failed attempts use up the budget. Like the other limiters, it
// is per process. Trade-off: anyone can burn an account's budget by failing sign-in for that email,
// locking the owner out until the window ends. That is accepted over allowing unbounded
// distributed guessing.
export const signinEmailRateLimit = createAttemptLimiter(
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
// Reset codes carry 120 bits and expire within the hour; this only stops bulk guessing.
export const passwordResetRateLimit = createRateLimiter(
  FIFTEEN_MINUTES_MS,
  PASSWORD_RESET_MAX_ATTEMPTS,
);
