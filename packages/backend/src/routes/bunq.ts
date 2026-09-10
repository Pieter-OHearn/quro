import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { bunqConnections } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import { buildOAuthAuthorizeUrl, deleteSession, exchangeCodeForTokens } from '../lib/bunqClient';
import { syncBunqBudget } from '../services/bunqBudgetSync';
import { syncBunqSavings } from '../services/bunqSavingsSync';

const app = new Hono();

const STATE_COOKIE = 'bunq_oauth_state';
const STATE_MAX_AGE_SECONDS = 600;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? '';
const FRONTEND_BASE_URL = FRONTEND_ORIGIN || 'http://localhost:5173';

const BUNQ_STATE_KEY = process.env.BUNQ_CLIENT_SECRET ?? '';

type BunqOAuthDestination = 'savings' | 'settings';
type BunqOAuthStatus = 'connected' | 'error';

type ParsedOAuthState = {
  userId: number;
  destination: BunqOAuthDestination;
};

function resolveOAuthDestination(value: string | undefined): BunqOAuthDestination {
  return value === 'savings' ? 'savings' : 'settings';
}

function buildFrontendRedirect(destination: BunqOAuthDestination, status: BunqOAuthStatus): string {
  return `${FRONTEND_BASE_URL}/${destination}?bunq=${status}`;
}

export function buildOAuthState(
  userId: number,
  nonce: string,
  destination: BunqOAuthDestination = 'settings',
): string {
  const payload = `${userId}:${destination}:${nonce}`;
  const sig = createHmac('sha256', BUNQ_STATE_KEY).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

// Verifies the HMAC signature on an OAuth `state` value and returns the user and
// allow-listed destination it was issued for. This authenticates the callback
// when it lands without a Quro session cookie.
export function parseSignedOAuthState(state: string): ParsedOAuthState | null {
  const dotIdx = state.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const payload = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);
  const expectedSig = createHmac('sha256', BUNQ_STATE_KEY).update(payload).digest('hex');
  try {
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const actualBuf = Buffer.from(sig, 'hex');
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, actualBuf)) return null;
  } catch {
    return null;
  }
  const colonIdx = payload.indexOf(':');
  if (colonIdx === -1) return null;
  const userId = parseInt(payload.slice(0, colonIdx), 10);
  if (!Number.isInteger(userId)) return null;

  const remainingPayload = payload.slice(colonIdx + 1);
  const destinationEnd = remainingPayload.indexOf(':');
  if (destinationEnd < 0) {
    return { userId, destination: 'settings' };
  }

  const destination = remainingPayload.slice(0, destinationEnd);
  if (destination !== 'savings' && destination !== 'settings') return null;
  return { userId, destination };
}

export function parseSignedState(state: string): number | null {
  return parseSignedOAuthState(state)?.userId ?? null;
}

function logBunqError(label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown Bunq error';
  console.error(label, { message });
}

function mergeSyncResults(
  savingsResult: Awaited<ReturnType<typeof syncBunqSavings>>,
  budgetResult: Awaited<ReturnType<typeof syncBunqBudget>>,
) {
  const issues = [...savingsResult.issues, ...budgetResult.issues];
  return {
    ok: issues.length === 0,
    status: issues.length > 0 ? 'partial' : 'success',
    issues,
  };
}

app.get('/oauth/start', (c) => {
  const user = getAuthUser(c);
  const nonce = randomBytes(32).toString('hex');
  const destination = resolveOAuthDestination(c.req.query('returnTo'));
  const state = buildOAuthState(user.id, nonce, destination);

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
  const parsedState = queryState ? parseSignedOAuthState(queryState) : null;
  const errorRedirect = buildFrontendRedirect(parsedState?.destination ?? 'settings', 'error');

  deleteCookie(c, STATE_COOKIE, { path: '/' });

  if (!queryState || !code) {
    return c.redirect(errorRedirect);
  }

  // When the callback returns to the same browser that started the flow, enforce
  // the double-submit cookie. Mobile/in-app browsers won't carry it, so we fall
  // back to the signed state below, which cryptographically binds the request to
  // a user without needing any cookie.
  if (storedState && storedState !== queryState) {
    return c.redirect(errorRedirect);
  }

  if (parsedState === null) {
    return c.redirect(errorRedirect);
  }
  const { userId, destination } = parsedState;

  try {
    const tokens = await exchangeCodeForTokens(code);

    await db
      .insert(bunqConnections)
      .values({
        userId,
        accessToken: tokens.accessToken,
      })
      .onConflictDoUpdate({
        target: bunqConnections.userId,
        set: {
          accessToken: tokens.accessToken,
          privateKey: null,
          installationToken: null,
          serverPublicKey: null,
          sessionToken: null,
          sessionId: null,
          sessionExpiresAt: null,
          bunqUserId: null,
          syncStatus: 'idle',
          syncError: null,
        },
      });

    return c.redirect(buildFrontendRedirect(destination, 'connected'));
  } catch (e) {
    logBunqError('[bunq oauth callback error]', e);
    return c.redirect(buildFrontendRedirect(destination, 'error'));
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

  const [connection] = await db
    .select({
      sessionToken: bunqConnections.sessionToken,
      sessionId: bunqConnections.sessionId,
    })
    .from(bunqConnections)
    .where(eq(bunqConnections.userId, user.id));

  if (connection?.sessionToken && connection.sessionId !== null) {
    try {
      await deleteSession(connection.sessionToken, connection.sessionId);
    } catch (error) {
      logBunqError('[bunq session delete error]', error);
    }
  }

  await db.delete(bunqConnections).where(eq(bunqConnections.userId, user.id));

  return c.json({ data: { ok: true } }, HTTP_STATUS.OK);
});

app.post('/sync/savings', async (c) => {
  const user = getAuthUser(c);

  try {
    const result = await syncBunqSavings(user.id);
    if (result.status === 'skipped') {
      return c.json({ error: 'No Bunq connection found' }, HTTP_STATUS.NOT_FOUND);
    }
    if (result.status === 'partial') {
      return c.json(
        { data: { ok: false, status: result.status, issues: result.issues } },
        HTTP_STATUS.OK,
      );
    }
    return c.json(
      { data: { ok: true, status: result.status, syncedAt: result.syncedAt?.toISOString() } },
      HTTP_STATUS.OK,
    );
  } catch (e) {
    logBunqError('[bunq savings sync error]', e);
    const message = e instanceof Error ? e.message : 'Bunq savings sync failed';
    return c.json({ error: message }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
});

app.post('/sync/budget', async (c) => {
  const user = getAuthUser(c);

  try {
    const result = await syncBunqBudget(user.id);
    if (result.status === 'skipped') {
      return c.json({ error: 'No Bunq connection found' }, HTTP_STATUS.NOT_FOUND);
    }
    if (result.status === 'partial') {
      return c.json(
        { data: { ok: false, status: result.status, issues: result.issues } },
        HTTP_STATUS.OK,
      );
    }
    return c.json(
      { data: { ok: true, status: result.status, syncedAt: result.syncedAt?.toISOString() } },
      HTTP_STATUS.OK,
    );
  } catch (e) {
    logBunqError('[bunq budget sync error]', e);
    const message = e instanceof Error ? e.message : 'Bunq budget sync failed';
    return c.json({ error: message }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
});

app.post('/sync', async (c) => {
  const user = getAuthUser(c);

  const [connection] = await db
    .select({ id: bunqConnections.id, lastSyncAt: bunqConnections.lastSyncAt })
    .from(bunqConnections)
    .where(eq(bunqConnections.userId, user.id));

  if (!connection) {
    return c.json({ error: 'No Bunq connection found' }, HTTP_STATUS.NOT_FOUND);
  }

  const newerThan = connection.lastSyncAt?.toISOString();

  try {
    const savingsResult = await syncBunqSavings(user.id, newerThan, true);
    const budgetResult = await syncBunqBudget(user.id, newerThan, true);
    const combined = mergeSyncResults(savingsResult, budgetResult);
    const syncedAt = new Date();
    if (combined.ok) {
      await db
        .update(bunqConnections)
        .set({ lastSyncAt: syncedAt, syncStatus: 'idle', syncError: null })
        .where(eq(bunqConnections.id, connection.id));
    }
    return c.json(
      { data: { ...combined, syncedAt: combined.ok ? syncedAt.toISOString() : null } },
      HTTP_STATUS.OK,
    );
  } catch (e) {
    logBunqError('[bunq sync error]', e);
    const message = e instanceof Error ? e.message : 'Bunq sync failed';
    return c.json({ error: message }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
});

export default app;
