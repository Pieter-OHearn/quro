import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { bunqConnections, bunqOauthAttempts } from '../db/schema';
import { consumeOAuthAttempt } from '../lib/bunqOAuthAttempts';
import { BUNQ_TEST_ORIGIN, bunqStateCookie, clearBunqTestEnv, setBunqTestEnv } from '../test/bunq';
import { createIntegrationHelpers } from '../test/integration';
import { applyTestSettings } from '../test/config';

const integration = createIntegrationHelpers('bunq.integration.quro.test');
const originalFetch = globalThis.fetch;
const ENV_NAMES = [
  'BUNQ_CLIENT_ID',
  'BUNQ_CLIENT_SECRET',
  'BUNQ_REDIRECT_URI',
  'FRONTEND_ORIGIN',
] as const;
const savedEnv = Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n]]));
const ORIGIN = BUNQ_TEST_ORIGIN;

function mockTokenExchange() {
  const fetchMock = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify({ access_token: 'fake-access-token' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function startAttempt(cookie: string, returnTo?: string) {
  const query = returnTo ? `?returnTo=${returnTo}` : '';
  const response = await integration.request(`/api/bunq/oauth/start${query}`, { cookie });
  expect(response.status).toBe(302);
  const state = new URL(response.headers.get('location') ?? '').searchParams.get('state');
  expect(state).toBeTruthy();
  return state as string;
}

// Sends the state cookie the initiating browser holds, unless a different one is given.
function callback(
  state: string | null,
  code: string | null = 'auth-code',
  cookieState: string | null = state,
) {
  const params = new URLSearchParams();
  if (state) params.set('state', state);
  if (code) params.set('code', code);
  const cookie = cookieState ? bunqStateCookie(cookieState) : null;
  return integration.request(`/api/bunq/oauth/callback?${params.toString()}`, { cookie });
}

function connectionsFor(userId: number) {
  return db.select().from(bunqConnections).where(eq(bunqConnections.userId, userId));
}

const userIds: number[] = [];

async function newUser(label: string) {
  const session = await integration.signUp(label);
  userIds.push(session.user.id);
  return session;
}

beforeAll(async () => {
  await integration.cleanup();
});

beforeEach(() => {
  setBunqTestEnv();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(async () => {
  applyTestSettings(savedEnv);
  if (userIds.length > 0) {
    await db.delete(bunqConnections).where(inArray(bunqConnections.userId, userIds));
  }
  await integration.cleanup();
});

describe('bunq unconfigured', () => {
  test('has no bunq routes and the capabilities explain why', async () => {
    const user = await newUser('unconfigured');
    clearBunqTestEnv();
    const fetchMock = mockTokenExchange();

    // Nothing is mounted for an integration that is not configured.
    const start = await integration.request('/api/bunq/oauth/start', { cookie: user.cookie });
    expect(start.status).toBe(404);
    const callbackResponse = await callback('anything');
    expect(callbackResponse.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await connectionsFor(user.user.id)).toHaveLength(0);

    const capabilities = await integration.request('/api/capabilities', { cookie: user.cookie });
    const body = (await capabilities.json()) as {
      data: { bunq: { enabled: boolean; reason: string; message: string } };
    };
    expect(body.data.bunq).toMatchObject({ enabled: false, reason: 'not_configured' });
    expect(body.data.bunq.message).toContain('unavailable');
  });
});

describe('bunq OAuth attempts', () => {
  test('a valid callback connects the initiating user and redirects to the destination', async () => {
    const user = await newUser('valid');
    mockTokenExchange();

    const state = await startAttempt(user.cookie, 'savings');
    const response = await callback(state);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/savings?bunq=connected`);
    const [connection] = await connectionsFor(user.user.id);
    expect(connection.accessToken).toBe('fake-access-token');
  });

  test('stores only a hash of the state', async () => {
    const user = await newUser('hashed');
    const state = await startAttempt(user.cookie);

    const rows = await db
      .select()
      .from(bunqOauthAttempts)
      .where(eq(bunqOauthAttempts.userId, user.user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].stateHash).not.toBe(state);
    expect(rows[0].stateHash).not.toContain(state);
  });

  test('rejects forged state without exchanging a code or touching connections', async () => {
    const user = await newUser('forged');
    const fetchMock = mockTokenExchange();
    await startAttempt(user.cookie);

    for (const forged of ['forged', `${user.user.id}:settings:abc.deadbeef`, 'a'.repeat(64)]) {
      const response = await callback(forged);
      expect(response.headers.get('location')).toBe(`${ORIGIN}/settings?bunq=error`);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await connectionsFor(user.user.id)).toHaveLength(0);
  });

  test('rejects missing code or state', async () => {
    const user = await newUser('missing');
    const state = await startAttempt(user.cookie);

    expect((await callback(state, null)).headers.get('location')).toContain('bunq=error');
    expect((await callback(null)).headers.get('location')).toContain('bunq=error');
    // The failed requests above must not have burned the attempt.
    expect(await consumeOAuthAttempt(state)).toMatchObject({ userId: user.user.id });
  });

  test('rejects expired state', async () => {
    const user = await newUser('expired');
    const fetchMock = mockTokenExchange();
    const state = await startAttempt(user.cookie);
    await db
      .update(bunqOauthAttempts)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(bunqOauthAttempts.userId, user.user.id));

    const response = await callback(state);

    expect(response.headers.get('location')).toBe(`${ORIGIN}/settings?bunq=error`);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await connectionsFor(user.user.id)).toHaveLength(0);
  });

  test('rejects replayed state and leaves the first connection untouched', async () => {
    const user = await newUser('replay');
    mockTokenExchange();
    const state = await startAttempt(user.cookie);

    expect((await callback(state)).headers.get('location')).toContain('bunq=connected');
    const fetchMock = mockTokenExchange();
    const replay = await callback(state);

    expect(replay.headers.get('location')).toContain('bunq=error');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await connectionsFor(user.user.id)).toHaveLength(1);
  });

  test('concurrent callbacks with the same state succeed exactly once', async () => {
    const user = await newUser('race');
    const fetchMock = mockTokenExchange();
    const state = await startAttempt(user.cookie);

    const responses = await Promise.all(Array.from({ length: 8 }, () => callback(state)));

    const outcomes = responses.map((r) => r.headers.get('location'));
    expect(outcomes.filter((l) => l?.includes('bunq=connected'))).toHaveLength(1);
    expect(outcomes.filter((l) => l?.includes('bunq=error'))).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await connectionsFor(user.user.id)).toHaveLength(1);
  });

  test('binds the attempt to its initiating user and destination, ignoring tampering', async () => {
    const alice = await newUser('alice');
    const bob = await newUser('bob');
    mockTokenExchange();
    const aliceState = await startAttempt(alice.cookie, 'savings');

    // A returnTo supplied at callback time cannot redirect elsewhere.
    const response = await integration.request(
      `/api/bunq/oauth/callback?state=${aliceState}&code=c&returnTo=https://evil.example`,
      { cookie: bunqStateCookie(aliceState) },
    );

    expect(response.headers.get('location')).toBe(`${ORIGIN}/savings?bunq=connected`);
    expect(await connectionsFor(alice.user.id)).toHaveLength(1);
    expect(await connectionsFor(bob.user.id)).toHaveLength(0);
  });

  test('rejects a callback whose cookie state differs from the query state', async () => {
    const user = await newUser('cookie');
    const fetchMock = mockTokenExchange();
    const state = await startAttempt(user.cookie);

    const response = await callback(state, 'c', 'another-state');

    expect(response.headers.get('location')).toContain('bunq=error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects a callback from a browser that did not start the attempt', async () => {
    const attacker = await newUser('attacker');
    const fetchMock = mockTokenExchange();
    const state = await startAttempt(attacker.cookie);

    // The victim's browser follows the attacker's link without the state cookie.
    const response = await callback(state, 'victim-code', null);

    expect(response.headers.get('location')).toContain('bunq=error');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await connectionsFor(attacker.user.id)).toHaveLength(0);
    // The rejected callback must not burn the attempt for the real initiator.
    expect(await consumeOAuthAttempt(state)).toMatchObject({ userId: attacker.user.id });
  });

  test('starting a new attempt invalidates the previous one for that user', async () => {
    const user = await newUser('supersede');
    mockTokenExchange();
    const first = await startAttempt(user.cookie, 'settings');
    const second = await startAttempt(user.cookie, 'savings');

    expect((await callback(first)).headers.get('location')).toContain('bunq=error');
    expect((await callback(second)).headers.get('location')).toBe(
      `${ORIGIN}/savings?bunq=connected`,
    );
  });
});
