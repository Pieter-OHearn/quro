import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { HTTP_STATUS } from '../constants/http';

import { PUBLIC_PATHS } from '../lib/publicPaths';
import { CSRF_COOKIE } from '../lib/sessions';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Signing out carries no body, and a forced sign-out only loses a session.
const BODYLESS_PUBLIC_PATHS = new Set(['/api/auth/signout']);

function isJsonRequest(contentType: string | undefined): boolean {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

export const requireCsrf = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  // Public auth endpoints run before a CSRF token exists. Requiring JSON still stops other
  // sites posting to them (login CSRF): a cross-origin form can only send simple content
  // types, and a cross-origin JSON request needs a CORS preflight the allowlist rejects.
  if (PUBLIC_PATHS.has(c.req.path)) {
    if (!BODYLESS_PUBLIC_PATHS.has(c.req.path) && !isJsonRequest(c.req.header('Content-Type'))) {
      return c.json(
        { error: 'Content-Type must be application/json' },
        HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    await next();
    return;
  }

  const cookieToken = getCookie(c, CSRF_COOKIE);
  const headerToken = c.req.header('X-CSRF-Token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return c.json({ error: 'Invalid CSRF token' }, HTTP_STATUS.FORBIDDEN);
  }

  await next();
});
