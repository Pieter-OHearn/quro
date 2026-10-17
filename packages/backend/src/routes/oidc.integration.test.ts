import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { PublicAuthPolicy } from '@quro/shared';
import { db } from '../db/client';
import { oidcIdentities, oidcLoginAttempts, sessions } from '../db/schema';
import { deleteAccount } from '../lib/accountDeletion';
import { resetOidcDiscovery, pkceChallenge } from '../lib/oidcClient';
import { applyTestSettings } from '../test/config';
import { createIntegrationHelpers } from '../test/integration';
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_REDIRECT_URI,
  startFakeProvider,
  type FakeGrant,
  type FakeProvider,
} from '../test/oidcProvider';

const integration = createIntegrationHelpers('oidc.integration.quro.test');
let provider: FakeProvider;
let restore: () => void;

const SETTINGS = (issuer: string) => ({
  OIDC_ISSUER: issuer,
  OIDC_CLIENT_ID: FAKE_CLIENT_ID,
  OIDC_CLIENT_SECRET: FAKE_CLIENT_SECRET,
  OIDC_REDIRECT_URI: FAKE_REDIRECT_URI,
  OIDC_PROVIDER_NAME: 'Authelia',
});

beforeAll(async () => {
  await integration.cleanup();
  provider = startFakeProvider();
  restore = applyTestSettings(SETTINGS(provider.issuer));
});

beforeEach(() => resetOidcDiscovery());

afterAll(async () => {
  restore();
  provider.stop();
  await db.delete(oidcLoginAttempts);
  await integration.cleanup();
});

type Begun = { cookie: string; state: string; nonce: string; challenge: string; location: URL };

/** The browser opens the login route; the provider is sent the sign-in's state and nonce. */
async function begin(): Promise<Begun> {
  const response = await integration.request('/api/auth/oidc/login');
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get('location')!);
  const setCookie = response.headers.get('set-cookie')!;
  return {
    cookie: setCookie.split(';')[0]!,
    state: location.searchParams.get('state')!,
    nonce: location.searchParams.get('nonce')!,
    challenge: location.searchParams.get('code_challenge')!,
    location,
  };
}

/** The provider redirects the browser back with a code it registered for this sign-in. */
function finish(
  begun: Begun,
  grant: Partial<FakeGrant> & { subject: string },
  override: { state?: string; cookie?: string | null; query?: string } = {},
) {
  const code = `code-${crypto.randomUUID()}`;
  provider.grant(code, {
    nonce: begun.nonce,
    challenge: begun.challenge,
    ...grant,
  });
  const query = override.query ?? `code=${code}&state=${override.state ?? begun.state}`;
  return integration.request(`/api/auth/oidc/callback?${query}`, {
    cookie: override.cookie === undefined ? begun.cookie : override.cookie,
  });
}

function location(response: Response) {
  return response.headers.get('location');
}

function identitiesOf(userId: number) {
  return db.select().from(oidcIdentities).where(eq(oidcIdentities.userId, userId));
}

describe('the login route', () => {
  test('sends the browser to the provider with PKCE and keeps the attempt in a cookie', async () => {
    const begun = await begin();
    expect(begun.location.origin).toBe(provider.issuer);
    expect(begun.location.pathname).toBe('/authorize');
    expect(begun.location.searchParams.get('client_id')).toBe(FAKE_CLIENT_ID);
    expect(begun.location.searchParams.get('redirect_uri')).toBe(FAKE_REDIRECT_URI);
    expect(begun.location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(begun.challenge).toHaveLength(pkceChallenge('x').length);

    const response = await integration.request('/api/auth/oidc/login');
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth/oidc');
  });

  test('stores only a digest of the cookie token', async () => {
    const begun = await begin();
    const token = begun.cookie.split('=')[1]!;
    const rows = await db.select().from(oidcLoginAttempts);
    expect(rows.some((row) => row.id === token)).toBe(false);
    expect(rows.some((row) => row.state === begun.state)).toBe(true);
  });

  test('returns to the landing page when the provider cannot be reached', async () => {
    const restoreDown = applyTestSettings({ OIDC_ISSUER: 'http://127.0.0.1:1' });
    try {
      const response = await integration.request('/api/auth/oidc/login');
      expect(location(response)).toBe('/?sso=failed');
    } finally {
      restoreDown();
    }
  });
});

describe('the registration policy', () => {
  test('names the provider for the sign-in button', async () => {
    const response = await integration.request('/api/auth/registration');
    const body = (await response.json()) as { data: PublicAuthPolicy };
    expect(body.data.singleSignOn).toEqual({ name: 'Authelia' });
  });
});

describe('signing in through the provider', () => {
  let owner: Awaited<ReturnType<typeof integration.signUp>>;

  beforeEach(async () => {
    owner = await integration.signUp('owner');
  });

  afterEach(async () => {
    await db.delete(oidcLoginAttempts);
  });

  test('links the first sign-in to the account with the same verified email', async () => {
    const response = await finish(await begin(), { subject: 'sub-1', email: owner.user.email });
    expect(response.status).toBe(302);
    expect(location(response)).toBe('/');

    const cookie = response.headers.get('set-cookie')!;
    const session = cookie.match(/session=([^;]+)/)![1]!;
    const me = await integration.request('/api/auth/me', { cookie: `session=${session}` });
    const body = (await me.json()) as { data: { id: number } };
    expect(body.data.id).toBe(owner.user.id);
    expect(await identitiesOf(owner.user.id)).toHaveLength(1);
    // The attempt cookie is cleared and cannot start another callback.
    expect(cookie).toMatch(/oidc_attempt=;/);
  });

  test('finds the account by subject once linked, even if the email changed', async () => {
    await finish(await begin(), { subject: 'sub-2', email: owner.user.email });
    const response = await finish(await begin(), {
      subject: 'sub-2',
      email: 'changed@example.com',
    });
    expect(location(response)).toBe('/');
    expect(await identitiesOf(owner.user.id)).toHaveLength(1);
  });

  test('refuses a person with no account and creates none', async () => {
    const response = await finish(await begin(), { subject: 'sub-3', email: 'nobody@example.com' });
    expect(location(response)).toBe('/?sso=no_account');
    expect(response.headers.get('set-cookie')).not.toContain('session=');
  });

  test('refuses an email address the provider has not verified', async () => {
    const response = await finish(await begin(), {
      subject: 'sub-4',
      email: owner.user.email,
      emailVerified: false,
    });
    expect(location(response)).toBe('/?sso=unverified_email');
    expect(await identitiesOf(owner.user.id)).toHaveLength(0);
  });

  test('refuses a second identity for an account that is already linked', async () => {
    await finish(await begin(), { subject: 'sub-5', email: owner.user.email });
    const response = await finish(await begin(), { subject: 'sub-6', email: owner.user.email });
    expect(location(response)).toBe('/?sso=conflict');
    expect(await identitiesOf(owner.user.id)).toHaveLength(1);
  });

  test('accepts a callback only once', async () => {
    const begun = await begin();
    const first = await finish(begun, { subject: 'sub-7', email: owner.user.email });
    expect(location(first)).toBe('/');
    const replay = await finish(begun, { subject: 'sub-7', email: owner.user.email });
    expect(location(replay)).toBe('/?sso=expired');
  });

  test('refuses a callback from a browser that did not start the sign-in', async () => {
    const begun = await begin();
    const stranger = await begin();
    const wrongBrowser = await finish(
      begun,
      { subject: 'sub-8', email: owner.user.email },
      {
        cookie: stranger.cookie,
      },
    );
    expect(location(wrongBrowser)).toBe('/?sso=expired');
    const noCookie = await finish(
      await begin(),
      { subject: 'sub-8', email: owner.user.email },
      {
        cookie: null,
      },
    );
    expect(location(noCookie)).toBe('/?sso=expired');
    expect(await identitiesOf(owner.user.id)).toHaveLength(0);
  });

  test('refuses a state that is not the one it sent', async () => {
    const response = await finish(
      await begin(),
      { subject: 'sub-9', email: owner.user.email },
      {
        state: 'forged',
      },
    );
    expect(location(response)).toBe('/?sso=expired');
  });

  test('refuses an expired attempt', async () => {
    const begun = await begin();
    await db.update(oidcLoginAttempts).set({ expiresAt: new Date(Date.now() - 1000) });
    const response = await finish(begun, { subject: 'sub-10', email: owner.user.email });
    expect(location(response)).toBe('/?sso=expired');
  });

  test('refuses an ID token for another nonce', async () => {
    const response = await finish(await begin(), {
      subject: 'sub-11',
      email: owner.user.email,
      claims: { nonce: 'another' },
    });
    expect(location(response)).toBe('/?sso=failed');
  });

  test('reports a provider fault as a failure, not as a refusal', async () => {
    const begun = await begin();
    const response = await integration.request('/api/auth/oidc/callback?error=server_error', {
      cookie: begun.cookie,
    });
    expect(location(response)).toBe('/?sso=failed');
  });

  test('reports a provider refusal and discards the attempt', async () => {
    const begun = await begin();
    const response = await integration.request('/api/auth/oidc/callback?error=access_denied', {
      cookie: begun.cookie,
    });
    expect(location(response)).toBe('/?sso=denied');
    expect(await db.select().from(oidcLoginAttempts)).toHaveLength(0);
  });

  test('ends the sessions the account had when the identity is linked', async () => {
    const before = await db.select().from(sessions).where(eq(sessions.userId, owner.user.id));
    expect(before.length).toBeGreaterThan(0);
    await finish(await begin(), { subject: 'sub-14', email: owner.user.email });
    const after = await db.select().from(sessions).where(eq(sessions.userId, owner.user.id));
    expect(after.some((row) => before.some((old) => old.id === row.id))).toBe(false);
    expect(after).toHaveLength(1);
  });

  test('links two sign-ins of the same person that race', async () => {
    const [first, second] = await Promise.all([begin(), begin()]);
    const responses = await Promise.all([
      finish(first, { subject: 'sub-15', email: owner.user.email }),
      finish(second, { subject: 'sub-15', email: owner.user.email }),
    ]);
    expect(responses.map(location)).toEqual(['/', '/']);
    expect(await identitiesOf(owner.user.id)).toHaveLength(1);
  });

  test('does not link by email in open registration mode, but signs a linked person in', async () => {
    await finish(await begin(), { subject: 'sub-16', email: owner.user.email });
    const other = await integration.signUp('other');
    const restoreOpen = applyTestSettings({ QRO_REGISTRATION_MODE: 'open' });
    try {
      const refused = await finish(await begin(), { subject: 'sub-17', email: other.user.email });
      expect(location(refused)).toBe('/?sso=no_account');
      expect(await identitiesOf(other.user.id)).toHaveLength(0);
      const known = await finish(await begin(), { subject: 'sub-16', email: owner.user.email });
      expect(location(known)).toBe('/');
    } finally {
      restoreOpen();
    }
  });

  test('accepts a provider that sends email_verified as a string', async () => {
    const response = await finish(await begin(), {
      subject: 'sub-18',
      email: owner.user.email,
      emailVerified: 'true' as unknown as boolean,
    });
    expect(location(response)).toBe('/');
  });

  test('starts a session that works like a password session', async () => {
    const response = await finish(await begin(), { subject: 'sub-12', email: owner.user.email });
    const cookie = response.headers.get('set-cookie')!;
    const session = cookie.match(/session=([^;]+)/)![1]!;
    expect(session).not.toBe('');
    const me = await integration.request('/api/auth/me', { cookie: `session=${session}` });
    expect(((await me.json()) as { data: { id: number } }).data.id).toBe(owner.user.id);
  });

  test('deleting the account removes its identity', async () => {
    await finish(await begin(), { subject: 'sub-13', email: owner.user.email });
    await deleteAccount(owner.user.id);
    expect(await identitiesOf(owner.user.id)).toHaveLength(0);
  });
});

describe('without a provider', () => {
  test('has no routes and offers no button', async () => {
    const restoreOff = applyTestSettings({
      OIDC_ISSUER: undefined,
      OIDC_CLIENT_ID: undefined,
      OIDC_CLIENT_SECRET: undefined,
      OIDC_REDIRECT_URI: undefined,
      OIDC_PROVIDER_NAME: undefined,
    });
    try {
      expect((await integration.request('/api/auth/oidc/login')).status).toBe(404);
      expect((await integration.request('/api/auth/oidc/callback?code=x&state=y')).status).toBe(
        404,
      );
      const policy = (await (await integration.request('/api/auth/registration')).json()) as {
        data: PublicAuthPolicy;
      };
      expect(policy.data.singleSignOn).toBeNull();
    } finally {
      restoreOff();
    }
  });
});
