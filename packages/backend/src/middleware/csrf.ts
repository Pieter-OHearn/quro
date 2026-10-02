import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { HTTP_STATUS } from '../constants/http';

import { PUBLIC_PATHS } from '../lib/publicPaths';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireCsrf = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }

  const cookieToken = getCookie(c, 'csrf_token');
  const headerToken = c.req.header('X-CSRF-Token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return c.json({ error: 'Invalid CSRF token' }, HTTP_STATUS.FORBIDDEN);
  }

  await next();
});
