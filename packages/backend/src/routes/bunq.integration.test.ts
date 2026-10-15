import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { bunqConnections, bunqOauthAttempts } from '../db/schema';
import { consumeOAuthAttempt } from '../lib/bunqOAuthAttempts';
import { BUNQ_TEST_ORIGIN, bunqStateCookie, clearBunqTestEnv, setBunqTestEnv } from '../test/bunq';
import { createIntegrationHelpers } from '../test/integration';
import { applyTestSettings } from '../test/config';
import { getConfig } from '../config';
import { secretPlace } from '../lib/integrationSecrets';
import { classifySecret, openSecret, type SecretsKeyring } from '../lib/secretEnvelope';

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

function keyring(): SecretsKeyring {
  return { current: getConfig().secrets.key, previous: null };
}

const accessTokenPlace = (userId: number) => secretPlace('access_token', userId);

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
    // Stored only encrypted, bound to this user's row, and opened with the instance's key.
    expect(connection.accessToken).not.toContain('fake-access-token');
    expect(classifySecret(connection.accessToken, keyring())).toBe('current');
    expect(
      openSecret(connection.accessToken, accessTokenPlace(user.user.id), keyring()).value,
    ).toBe('fake-access-token');
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

describe('stored bunq credentials', () => {
  const VALID_SESSION = {
    sessionId: 1,
    sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    bunqUserId: '42',
  };

  // bunq answers every call with an empty list: a sync then has nothing to import.
  function mockEmptyBank() {
    const fetchMock = mock(() => Promise.resolve(Response.json({ Response: [] })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  test('a connection stored unencrypted before is encrypted when the server next uses it', async () => {
    const user = await newUser('legacy-plaintext');
    await db.insert(bunqConnections).values({
      userId: user.user.id,
      accessToken: 'synthetic-legacy-access',
      sessionToken: 'synthetic-legacy-session',
      ...VALID_SESSION,
    });
    const fetchMock = mockEmptyBank();

    const response = await integration.request('/api/bunq/sync', {
      method: 'POST',
      cookie: user.cookie,
      headers: { 'X-CSRF-Token': user.csrfToken },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    const [row] = await connectionsFor(user.user.id);
    expect(classifySecret(row.accessToken, keyring())).toBe('current');
    expect(classifySecret(row.sessionToken!, keyring())).toBe('current');
    expect(row.privateKey).toBeNull();
    expect(openSecret(row.accessToken, accessTokenPlace(user.user.id), keyring()).value).toBe(
      'synthetic-legacy-access',
    );
  });

  test('credentials the key cannot open ask for a reconnect and call no provider', async () => {
    const user = await newUser('unreadable');
    const other = await newUser('unreadable-other');
    // A value sealed for another user's row: moving ciphertext between rows must fail.
    const sealedForOther = getConfig().secrets.key!.seal(
      'synthetic-moved-access',
      accessTokenPlace(other.user.id),
    );
    await db.insert(bunqConnections).values({
      userId: user.user.id,
      accessToken: sealedForOther,
      ...VALID_SESSION,
    });
    const fetchMock = mockEmptyBank();

    const response = await integration.request('/api/bunq/sync', {
      method: 'POST',
      cookie: user.cookie,
      headers: { 'X-CSRF-Token': user.csrfToken },
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe('bunq_reauthorization_required');
    expect(body.error).toContain('Reconnect bunq in Settings');
    expect(fetchMock).not.toHaveBeenCalled();
    const connection = await integration.request('/api/bunq/connection', { cookie: user.cookie });
    const { data } = (await connection.json()) as {
      data: { syncStatus: string; syncError: string };
    };
    expect(data).toMatchObject({ syncStatus: 'error' });
    expect(data.syncError).toContain('Reconnect bunq in Settings');
    // The stored value is left as it was: nothing is destroyed.
    expect((await connectionsFor(user.user.id))[0]!.accessToken).toBe(sealedForOther);
  });

  test('a changed byte in a stored credential is refused like a wrong key', async () => {
    const user = await newUser('tampered');
    const sealed = getConfig().secrets.key!.seal(
      'synthetic-tampered',
      accessTokenPlace(user.user.id),
    );
    const parts = sealed.split(':');
    const ciphertext = parts[5]!;
    parts[5] = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
    await db.insert(bunqConnections).values({
      userId: user.user.id,
      accessToken: parts.join(':'),
      ...VALID_SESSION,
    });
    mockEmptyBank();

    const response = await integration.request('/api/bunq/sync/savings', {
      method: 'POST',
      cookie: user.cookie,
      headers: { 'X-CSRF-Token': user.csrfToken },
    });
    expect(response.status).toBe(409);
  });

  test('disconnecting works when the stored session cannot be opened', async () => {
    const user = await newUser('disconnect-unreadable');
    await db.insert(bunqConnections).values({
      userId: user.user.id,
      accessToken:
        'quro-secret:v1:aes-256-gcm:0000000000000000:AAAAAAAAAAAAAAAA:AA:AAAAAAAAAAAAAAAAAAAAAA',
      sessionToken:
        'quro-secret:v1:aes-256-gcm:0000000000000000:AAAAAAAAAAAAAAAA:AA:AAAAAAAAAAAAAAAAAAAAAA',
      ...VALID_SESSION,
    });
    const fetchMock = mockEmptyBank();

    const response = await integration.request('/api/bunq/connection', {
      method: 'DELETE',
      cookie: user.cookie,
      headers: { 'X-CSRF-Token': user.csrfToken },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await connectionsFor(user.user.id)).toHaveLength(0);
  });

  test('reconnecting replaces credentials the key cannot open', async () => {
    const user = await newUser('reauthorize');
    await db.insert(bunqConnections).values({
      userId: user.user.id,
      accessToken:
        'quro-secret:v1:aes-256-gcm:0000000000000000:AAAAAAAAAAAAAAAA:AA:AAAAAAAAAAAAAAAAAAAAAA',
      ...VALID_SESSION,
    });
    mockTokenExchange();

    const state = await startAttempt(user.cookie);
    expect((await callback(state)).headers.get('location')).toContain('bunq=connected');

    const [row] = await connectionsFor(user.user.id);
    expect(openSecret(row.accessToken, accessTokenPlace(user.user.id), keyring()).value).toBe(
      'fake-access-token',
    );
    expect(row).toMatchObject({ privateKey: null, sessionToken: null, syncStatus: 'idle' });
  });
});
