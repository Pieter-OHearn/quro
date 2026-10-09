import { createMiddleware } from 'hono/factory';
import { getConfig } from '../config';
import { secureCookiesEnabled } from '../lib/sessions';

// SECURE_COOKIES is configuration and is never inferred from a request. These checks only log
// when it disagrees with the scheme browsers use, a mistake that otherwise fails silently: no
// Secure flag behind HTTPS, or browsers dropping a Secure cookie served over plain HTTP.

export type CookieTransportMismatch = 'insecure_over_https' | 'secure_over_http';

const MESSAGES: Record<CookieTransportMismatch, string> = {
  insecure_over_https:
    'Browsers reach Quro over HTTPS but SECURE_COOKIES is false, so session cookies lack the Secure flag. Set SECURE_COOKIES=true (deployment mode B in docs/security.md).',
  secure_over_http:
    'Browsers reach Quro over plain HTTP but SECURE_COOKIES is true, so browsers discard the session cookie and sign-in does not stick. Set SECURE_COOKIES=false or serve Quro over HTTPS (docs/security.md).',
};

// Browsers treat loopback as a secure context and keep Secure cookies sent over http there.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function detectCookieTransportMismatch(
  secureCookies: boolean,
  origin: string | null | undefined,
): CookieTransportMismatch | null {
  if (!origin || !URL.canParse(origin)) return null;
  const { protocol, hostname } = new URL(origin);
  if (protocol === 'https:' && !secureCookies) return 'insecure_over_https';
  if (protocol === 'http:' && secureCookies && !LOOPBACK_HOSTS.has(hostname)) {
    return 'secure_over_http';
  }
  return null;
}

// Where the scheme came from. Only configuration is trustworthy: any client can send an Origin
// header, so a warning based on one asks the operator to confirm before changing anything.
export type CookieTransportSource = 'configuration' | 'request';

const SOURCE_NOTES: Record<CookieTransportSource, string> = {
  configuration: 'Detected from FRONTEND_ORIGIN.',
  request:
    'Detected from the Origin header of a sign-in request, which any client can set: confirm how browsers reach Quro before changing the setting.',
};

export function createCookieTransportWarner(warn: (message: string) => void = console.warn) {
  const reported = new Set<CookieTransportMismatch>();
  return (
    secureCookies: boolean,
    origin: string | null | undefined,
    source: CookieTransportSource,
  ) => {
    const mismatch = detectCookieTransportMismatch(secureCookies, origin);
    if (!mismatch || reported.has(mismatch)) return;
    reported.add(mismatch);
    warn(`[config] ${MESSAGES[mismatch]} ${SOURCE_NOTES[source]}`);
  };
}

const warnOnce = createCookieTransportWarner();

/** Startup check against the configured public origin, when the deployment sets one. */
export function checkConfiguredCookieTransport(): void {
  const { secureCookies, frontendOrigin } = getConfig().web;
  warnOnce(secureCookies, frontendOrigin, 'configuration');
}

/**
 * Checks the Origin header of requests that set session cookies. Browsers send it on every POST
 * and proxies pass it through unchanged, so it shows the scheme the browser uses even behind a
 * chain of proxies. A forged header can only produce one cautious log line per process.
 */
export const cookieTransportCheck = createMiddleware(async (c, next) => {
  if (c.req.method === 'POST') {
    warnOnce(secureCookiesEnabled(), c.req.header('Origin'), 'request');
  }
  await next();
});
