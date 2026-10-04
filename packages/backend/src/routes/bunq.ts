import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { bunqConnections, bunqPaymentProgress } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import { BUNQ_UNAVAILABLE_MESSAGE, loadBunqConfig } from '../lib/bunqConfig';
import {
  OAUTH_ATTEMPT_TTL_MS,
  consumeOAuthAttempt,
  createOAuthAttempt,
  type BunqOAuthDestination,
} from '../lib/bunqOAuthAttempts';
import { buildOAuthAuthorizeUrl, deleteSession, exchangeCodeForTokens } from '../lib/bunqClient';
import { syncBunqBudget } from '../services/bunqBudgetSync';
import { syncBunqSavings } from '../services/bunqSavingsSync';

const app = new Hono();

const STATE_COOKIE = 'bunq_oauth_state';
const STATE_MAX_AGE_SECONDS = OAUTH_ATTEMPT_TTL_MS / 1000;

type BunqOAuthStatus = 'connected' | 'error';

function resolveOAuthDestination(value: string | undefined): BunqOAuthDestination {
  return value === 'savings' ? 'savings' : 'settings';
}

function buildFrontendRedirect(
  origin: string,
  destination: BunqOAuthDestination,
  status: BunqOAuthStatus,
): string {
  return `${origin}/${destination}?bunq=${status}`;
}

function unavailable(c: Context) {
  return c.json({ error: BUNQ_UNAVAILABLE_MESSAGE }, HTTP_STATUS.SERVICE_UNAVAILABLE);
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

app.get('/oauth/start', async (c) => {
  if (!loadBunqConfig().enabled) return unavailable(c);

  const user = getAuthUser(c);
  const destination = resolveOAuthDestination(c.req.query('returnTo'));
  const state = await createOAuthAttempt(user.id, destination);

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
  const config = loadBunqConfig();
  if (!config.enabled) return unavailable(c);

  const storedState = getCookie(c, STATE_COOKIE);
  const queryState = c.req.query('state');
  const code = c.req.query('code');
  const fail = (destination: BunqOAuthDestination = 'settings') =>
    c.redirect(buildFrontendRedirect(config.frontendOrigin, destination, 'error'));

  deleteCookie(c, STATE_COOKIE, { path: '/' });

  if (!queryState || !code) return fail();

  // When the callback returns to the browser that started the flow, the cookie must
  // match. Mobile/in-app browsers may not carry it; the recorded attempt below still
  // binds the callback to the initiating user and destination.
  if (storedState && storedState !== queryState) return fail();

  const attempt = await consumeOAuthAttempt(queryState);
  if (attempt === null) return fail();
  const { userId, destination } = attempt;

  try {
    const tokens = await exchangeCodeForTokens(code);

    await db.transaction(async (tx) => {
      await tx
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

      await tx.delete(bunqPaymentProgress).where(eq(bunqPaymentProgress.userId, userId));
    });

    return c.redirect(buildFrontendRedirect(config.frontendOrigin, destination, 'connected'));
  } catch (e) {
    logBunqError('[bunq oauth callback error]', e);
    return fail(destination);
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

  await db.transaction(async (tx) => {
    await tx.delete(bunqPaymentProgress).where(eq(bunqPaymentProgress.userId, user.id));
    await tx.delete(bunqConnections).where(eq(bunqConnections.userId, user.id));
  });

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

function syncTime(syncedAt: Date | null): number {
  return syncedAt?.getTime() ?? Date.now();
}

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
    const syncedAt = new Date(
      Math.min(syncTime(savingsResult.syncedAt), syncTime(budgetResult.syncedAt)),
    );
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
