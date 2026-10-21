import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { getConfig } from '../config';
import { HTTP_STATUS } from '../constants/http';
import { MINUTE_MS } from '../constants/time';
import { db } from '../db/client';
import { sessions } from '../db/schema';

// `QRO_PASSWORD_LOGIN=false` turns off every way Quro's own passwords are set or checked, so the
// single sign-on provider is the only way in. The setting is read from the configuration, which
// the startup check keeps consistent: it is off only when a provider is configured.

export const PASSWORD_LOGIN_OFF_MESSAGE =
  'Passwords are turned off on this Quro instance. Sign in through single sign-on.';

export const PASSWORD_LOGIN_OFF_UNLINK_MESSAGE =
  'Single sign-on is the only way to sign in here, so only the instance operator can unlink it.';

export const FRESH_SIGN_IN_REQUIRED_MESSAGE =
  'Sign out and sign in again with single sign-on, then repeat this within 10 minutes.';

const FRESH_SIGN_IN_MINUTES = 10;
const FRESH_SIGN_IN_MS = FRESH_SIGN_IN_MINUTES * MINUTE_MS;

export function passwordLoginEnabled(): boolean {
  return getConfig().web.passwordLogin;
}

/** Refuses the route with a fixed message while passwords are turned off. Runs before any work. */
export const requirePasswordLogin = createMiddleware(async (c, next) => {
  if (!passwordLoginEnabled()) {
    return c.json({ error: PASSWORD_LOGIN_OFF_MESSAGE }, HTTP_STATUS.FORBIDDEN);
  }
  await next();
});

/**
 * Whether the session was created in the last few minutes. With passwords off a session can only
 * come from the provider, so this stands in for typing the password again before an action that
 * cannot be undone.
 */
export async function isFreshSignIn(sessionId: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  return row !== undefined && now.getTime() - row.createdAt.getTime() <= FRESH_SIGN_IN_MS;
}
