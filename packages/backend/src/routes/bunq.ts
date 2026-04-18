import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { bunqConnections } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import { buildOAuthAuthorizeUrl, exchangeCodeForTokens } from '../lib/bunqClient';

const app = new Hono();

const STATE_COOKIE = 'bunq_oauth_state';
const STATE_MAX_AGE_SECONDS = 600;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? '';
const FRONTEND_SETTINGS_PATH = `${FRONTEND_ORIGIN}/settings`;

app.get('/oauth/start', (c) => {
  const state = randomBytes(32).toString('hex');

  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === 'true',
    sameSite: 'Lax',
    path: '/',
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  return c.redirect(buildOAuthAuthorizeUrl(state));
});

app.get('/oauth/callback', async (c) => {
  const storedState = getCookie(c, STATE_COOKIE);
  const queryState = c.req.query('state');
  const code = c.req.query('code');

  deleteCookie(c, STATE_COOKIE, { path: '/' });

  if (!storedState || !queryState || storedState !== queryState) {
    return c.redirect(`${FRONTEND_SETTINGS_PATH}?bunq=error`);
  }

  if (!code) {
    return c.redirect(`${FRONTEND_SETTINGS_PATH}?bunq=error`);
  }

  const user = getAuthUser(c);

  try {
    const tokens = await exchangeCodeForTokens(code);

    const [existing] = await db
      .select({ id: bunqConnections.id })
      .from(bunqConnections)
      .where(eq(bunqConnections.userId, user.id));

    if (existing) {
      await db
        .update(bunqConnections)
        .set({
          accessToken: tokens.accessToken,
          syncStatus: 'idle',
          syncError: null,
        })
        .where(eq(bunqConnections.id, existing.id));
    } else {
      await db.insert(bunqConnections).values({
        userId: user.id,
        accessToken: tokens.accessToken,
      });
    }

    return c.redirect(`${FRONTEND_SETTINGS_PATH}?bunq=connected`);
  } catch (e) {
    console.error('[bunq oauth callback error]', e);
    return c.redirect(`${FRONTEND_SETTINGS_PATH}?bunq=error`);
  }
});

app.get('/connection', async (c) => {
  const user = getAuthUser(c);

  const [connection] = await db
    .select({
      id: bunqConnections.id,
      userId: bunqConnections.userId,
      bunqUserId: bunqConnections.bunqUserId,
      lastSyncAt: bunqConnections.lastSyncAt,
      syncStatus: bunqConnections.syncStatus,
      syncError: bunqConnections.syncError,
      createdAt: bunqConnections.createdAt,
    })
    .from(bunqConnections)
    .where(eq(bunqConnections.userId, user.id));

  if (!connection) {
    return c.json({ error: 'No Bunq connection found' }, HTTP_STATUS.NOT_FOUND);
  }

  return c.json({ data: connection }, HTTP_STATUS.OK);
});

app.delete('/connection', async (c) => {
  const user = getAuthUser(c);

  await db.delete(bunqConnections).where(eq(bunqConnections.userId, user.id));

  return c.json({ data: { ok: true } }, HTTP_STATUS.OK);
});

export default app;
