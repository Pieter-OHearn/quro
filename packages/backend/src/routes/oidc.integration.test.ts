import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import type { PublicAuthPolicy } from '@quro/shared';
import { getConfig } from '../config';
import { db } from '../db/client';
import { oidcIdentities, oidcLoginAttempts, sessions } from '../db/schema';
import { deleteAccount } from '../lib/accountDeletion';
import { enterMaintenance, leaveMaintenance } from '../lib/maintenanceMode';
import { resetOidcDiscovery, pkceChallenge } from '../lib/oidcClient';
import { applyTestSettings } from '../test/config';
import {
  createIntegrationHelpers,
  insertPartnerLink,
  integrationPassword,
} from '../test/integration';
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_REDIRECT_URI,
  newSigningKey,
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
  provider = await startFakeProvider();
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
      expect(location(response)).toBe('/welcome?sso=failed');
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
    expect(location(response)).toBe('/welcome?sso=no_account');
    expect(response.headers.get('set-cookie')).not.toContain('session=');
  });

  test('refuses an email address the provider has not verified', async () => {
    const response = await finish(await begin(), {
      subject: 'sub-4',
      email: owner.user.email,
      emailVerified: false,
    });
    expect(location(response)).toBe('/welcome?sso=unverified_email');
    expect(await identitiesOf(owner.user.id)).toHaveLength(0);
  });

  test('refuses a second identity for an account that is already linked', async () => {
    await finish(await begin(), { subject: 'sub-5', email: owner.user.email });
    const response = await finish(await begin(), { subject: 'sub-6', email: owner.user.email });
    expect(location(response)).toBe('/welcome?sso=conflict');
    expect(await identitiesOf(owner.user.id)).toHaveLength(1);
  });

  test('accepts a callback only once', async () => {
    const begun = await begin();
    const first = await finish(begun, { subject: 'sub-7', email: owner.user.email });
    expect(location(first)).toBe('/');
    const replay = await finish(begun, { subject: 'sub-7', email: owner.user.email });
    expect(location(replay)).toBe('/welcome?sso=expired');
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
    expect(location(wrongBrowser)).toBe('/welcome?sso=expired');
    const noCookie = await finish(
      await begin(),
      { subject: 'sub-8', email: owner.user.email },
      {
        cookie: null,
      },
    );
    expect(location(noCookie)).toBe('/welcome?sso=expired');
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
    expect(location(response)).toBe('/welcome?sso=expired');
  });

  test('refuses an expired attempt', async () => {
    const begun = await begin();
    await db.update(oidcLoginAttempts).set({ expiresAt: new Date(Date.now() - 1000) });
    const response = await finish(begun, { subject: 'sub-10', email: owner.user.email });
    expect(location(response)).toBe('/welcome?sso=expired');
  });

  test('refuses an ID token for another nonce', async () => {
    const response = await finish(await begin(), {
      subject: 'sub-11',
      email: owner.user.email,
      claims: { nonce: 'another' },
    });
    expect(location(response)).toBe('/welcome?sso=failed');
  });

  test('reports a provider fault as a failure, not as a refusal', async () => {
    const begun = await begin();
    const response = await integration.request('/api/auth/oidc/callback?error=server_error', {
      cookie: begun.cookie,
    });
    expect(location(response)).toBe('/welcome?sso=failed');
  });

  test('reports a provider refusal and discards the attempt', async () => {
    const begun = await begin();
    const response = await integration.request('/api/auth/oidc/callback?error=access_denied', {
      cookie: begun.cookie,
    });
    expect(location(response)).toBe('/welcome?sso=denied');
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
      expect(location(refused)).toBe('/welcome?sso=no_account');
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

function sessionOf(response: Response): string | null {
  return response.headers.get('set-cookie')?.match(/session=([^;]+)/)?.[1] ?? null;
}

async function userOf(session: string): Promise<number> {
  const me = await integration.request('/api/auth/me', { cookie: `session=${session}` });
  return ((await me.json()) as { data: { id: number } }).data.id;
}

describe('a callback that must not sign anyone in', () => {
  let owner: Awaited<ReturnType<typeof integration.signUp>>;

  beforeEach(async () => {
    owner = await integration.signUp('owner-refusals');
  });

  afterEach(async () => {
    await db.delete(oidcLoginAttempts);
  });

  async function expectRefused(response: Response, reason: string) {
    expect(response.status).toBe(302);
    expect(location(response)).toBe(`/welcome?sso=${reason}`);
    expect(sessionOf(response)).toBeNull();
    expect(await response.text()).toBe('');
    expect(await identitiesOf(owner.user.id)).toHaveLength(0);
  }

  test.each([
    ['another audience', () => ({ aud: ['someone-else'] })],
    ['another issuer', () => ({ iss: 'https://evil.example' })],
    ['the issuer with a trailing slash', () => ({ iss: `${provider.issuer}/` })],
    ['an expired ID token', () => ({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['no nonce', () => ({ nonce: undefined })],
    ['several audiences without authorized party', () => ({ aud: [FAKE_CLIENT_ID, 'other'] })],
  ])('refuses %s', async (_label, claims) => {
    const response = await finish(await begin(), {
      subject: 'sub-claims',
      email: owner.user.email,
      claims: claims(),
    });
    await expectRefused(response, 'failed');
  });

  test('refuses an ID token signed by a key the provider does not publish', async () => {
    const response = await finish(await begin(), {
      subject: 'sub-forged',
      email: owner.user.email,
      signWith: await newSigningKey(provider.key.alg),
    });
    await expectRefused(response, 'failed');
  });

  test('refuses a callback without a code or without a state', async () => {
    const begun = await begin();
    await expectRefused(
      await integration.request(`/api/auth/oidc/callback?state=${begun.state}`, {
        cookie: begun.cookie,
      }),
      'expired',
    );
    const second = await begin();
    await expectRefused(
      await integration.request('/api/auth/oidc/callback?code=abc', { cookie: second.cookie }),
      'expired',
    );
    // The attempt is spent by a callback that failed, so the right one cannot follow it.
    const third = await begin();
    await integration.request('/api/auth/oidc/callback?code=abc&state=wrong', {
      cookie: third.cookie,
    });
    await expectRefused(
      await finish(third, { subject: 'sub-late', email: owner.user.email }),
      'expired',
    );
  });

  test('refuses a profile for another subject than the ID token names', async () => {
    const response = await finish(await begin(), {
      subject: 'sub-a',
      userinfoSubject: 'sub-b',
      email: owner.user.email,
    });
    await expectRefused(response, 'failed');
  });

  test('refuses when the provider rejects the code, for instance a replayed one', async () => {
    const begun = await begin();
    const response = await integration.request(
      `/api/auth/oidc/callback?code=never-issued&state=${begun.state}`,
      { cookie: begun.cookie },
    );
    await expectRefused(response, 'failed');
  });

  test('refuses a linked person whose provider reports a different state than the cookie', async () => {
    const first = await begin();
    const stolen = await begin();
    // Someone else's authorization link, finished in this browser: the cookie is this
    // browser's, the state is the other sign-in's.
    const response = await finish(
      first,
      { subject: 'sub-x', email: owner.user.email },
      { state: stolen.state, cookie: first.cookie },
    );
    await expectRefused(response, 'expired');
  });
});

describe('which account a provider sign-in reaches', () => {
  test('goes by the subject, not by an email that belongs to another account', async () => {
    const first = await integration.signUp('owner-subject');
    const second = await integration.signUp('other-subject');
    await finish(await begin(), { subject: 'sub-first', email: first.user.email });
    // The provider now reports the second account's address for the first person.
    const response = await finish(await begin(), {
      subject: 'sub-first',
      email: second.user.email,
    });
    expect(location(response)).toBe('/');
    expect(await userOf(sessionOf(response)!)).toBe(first.user.id);
    expect(await identitiesOf(second.user.id)).toHaveLength(0);
    expect(await identitiesOf(first.user.id)).toHaveLength(1);
  });

  test('does not hand an account to a second subject that claims its email', async () => {
    const owner = await integration.signUp('owner-second');
    await finish(await begin(), { subject: 'sub-real', email: owner.user.email });
    const response = await finish(await begin(), { subject: 'sub-other', email: owner.user.email });
    expect(location(response)).toBe('/welcome?sso=conflict');
    expect(sessionOf(response)).toBeNull();
    const rows = await identitiesOf(owner.user.id);
    expect(rows.map((row) => row.subject)).toEqual(['sub-real']);
  });

  test('links the same email at a new issuer only as a second identity, never as a takeover', async () => {
    const owner = await integration.signUp('owner-issuer');
    await finish(await begin(), { subject: 'same-sub', email: owner.user.email });
    const other = await startFakeProvider();
    const restoreOther = applyTestSettings({ OIDC_ISSUER: other.issuer });
    resetOidcDiscovery();
    try {
      const begun = await begin();
      const code = `code-${crypto.randomUUID()}`;
      other.grant(code, {
        nonce: begun.nonce,
        challenge: begun.challenge,
        subject: 'same-sub',
        email: owner.user.email,
      });
      const response = await integration.request(
        `/api/auth/oidc/callback?code=${code}&state=${begun.state}`,
        { cookie: begun.cookie },
      );
      // The subject is only unique within an issuer, so a second provider is a separate identity,
      // and an account takes one identity per provider.
      expect(location(response)).toBe('/');
      expect(await identitiesOf(owner.user.id)).toHaveLength(2);
    } finally {
      restoreOther();
      other.stop();
      resetOidcDiscovery();
    }
  });

  test('a deleted account cannot be reached again by its subject', async () => {
    const owner = await integration.signUp('owner-deleted');
    await finish(await begin(), { subject: 'sub-gone', email: owner.user.email });
    await deleteAccount(owner.user.id);
    expect(await identitiesOf(owner.user.id)).toHaveLength(0);
    const response = await finish(await begin(), { subject: 'sub-gone', email: owner.user.email });
    expect(location(response)).toBe('/welcome?sso=no_account');
    expect(sessionOf(response)).toBeNull();
  });

  test('gives a linked person no more than the account itself', async () => {
    const owner = await integration.signUp('owner-household');
    const partner = await integration.signUp('partner-household');
    await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
    const response = await finish(await begin(), { subject: 'sub-hh', email: owner.user.email });
    const session = sessionOf(response)!;
    // The same session as a password sign-in: it sees its own account, never the partner's.
    expect(await userOf(session)).toBe(owner.user.id);
    const cookie = `session=${session}`;
    const settings = await integration.request('/api/settings', { cookie });
    const body = (await settings.json()) as { data: { email: string } };
    expect(body.data.email).toBe(owner.user.email);
  });
});

describe('concurrent callbacks', () => {
  test('one attempt signs in once, however often its callback arrives together', async () => {
    const owner = await integration.signUp('owner-concurrent');
    const begun = await begin();
    const code = `code-${crypto.randomUUID()}`;
    provider.grant(code, {
      nonce: begun.nonce,
      challenge: begun.challenge,
      subject: 'sub-concurrent',
      email: owner.user.email,
    });
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        integration.request(`/api/auth/oidc/callback?code=${code}&state=${begun.state}`, {
          cookie: begun.cookie,
        }),
      ),
    );
    expect(responses.map(location).sort()).toEqual(
      ['/', ...Array(5).fill('/welcome?sso=expired')].sort(),
    );
    expect(responses.filter((response) => sessionOf(response) !== null)).toHaveLength(1);
    expect(await identitiesOf(owner.user.id)).toHaveLength(1);
  });

  test('two people racing for one account link only the first', async () => {
    const owner = await integration.signUp('owner-race');
    const [first, second] = await Promise.all([begin(), begin()]);
    const responses = await Promise.all([
      finish(first, { subject: 'sub-race-a', email: owner.user.email }),
      finish(second, { subject: 'sub-race-b', email: owner.user.email }),
    ]);
    expect(responses.map(location).sort()).toEqual(['/', '/welcome?sso=conflict']);
    expect(await identitiesOf(owner.user.id)).toHaveLength(1);
  });
});

describe('redirects', () => {
  const HOSTILE = [
    'redirect=//evil.example',
    'redirect_uri=https://evil.example/cb',
    'next=https://evil.example',
    'returnTo=//evil.example',
    'return_to=https://evil.example',
    'url=https://evil.example',
    'sso=//evil.example',
    'continue=https://evil.example',
  ].join('&');

  function staysHere(value: string | null) {
    return value !== null && /^\/(welcome\?sso=[a-z_]+)?$/.test(value);
  }

  test('the login route sends the browser only to the provider, whatever the query says', async () => {
    const response = await integration.request(`/api/auth/oidc/login?${HOSTILE}`);
    const target = new URL(location(response)!);
    expect(target.origin).toBe(provider.issuer);
    expect(target.searchParams.get('redirect_uri')).toBe(FAKE_REDIRECT_URI);
    expect(target.toString()).not.toContain('evil.example');
  });

  test('the callback sends the browser only to this site, whatever the query says', async () => {
    const owner = await integration.signUp('owner-redirect');
    const refused = await integration.request(
      `/api/auth/oidc/callback?${HOSTILE}&error=access_denied`,
      { cookie: (await begin()).cookie },
    );
    expect(staysHere(location(refused))).toBe(true);
    const begun = await begin();
    const signedIn = await finish(
      begun,
      { subject: 'sub-redirect', email: owner.user.email },
      { query: `${HOSTILE}&code=x&state=${begun.state}` },
    );
    expect(staysHere(location(signedIn))).toBe(true);
    const code = `code-${crypto.randomUUID()}`;
    const again = await begin();
    provider.grant(code, {
      nonce: again.nonce,
      challenge: again.challenge,
      subject: 'sub-redirect',
      email: owner.user.email,
    });
    const ok = await integration.request(
      `/api/auth/oidc/callback?${HOSTILE}&code=${code}&state=${again.state}`,
      { cookie: again.cookie },
    );
    expect(location(ok)).toBe('/');
  });
});

describe('what is logged and what the browser is told', () => {
  test('no token, code, state, nonce, email or subject reaches a log line or an error body', async () => {
    const lines: string[] = [];
    const spies = (['log', 'warn', 'error'] as const).map((level) =>
      spyOn(console, level).mockImplementation((line: unknown) => {
        lines.push(String(line));
      }),
    );
    const owner = await integration.signUp('owner-logs');
    const secrets: string[] = [FAKE_CLIENT_SECRET, owner.user.email];
    const bodies: string[] = [];
    try {
      const flow = async (
        grant: Partial<FakeGrant> & { subject: string },
        override: Parameters<typeof finish>[2] = {},
      ) => {
        const begun = await begin();
        secrets.push(begun.state, begun.nonce, begun.cookie.split('=')[1]!, grant.subject);
        const response = await finish(begun, grant, override);
        bodies.push(await response.text(), location(response) ?? '');
      };
      await flow({ subject: 'subject-secret-1', email: owner.user.email });
      await flow({ subject: 'subject-secret-2', email: owner.user.email });
      await flow({ subject: 'subject-secret-3', email: 'nobody-logs@example.com' });
      await flow({ subject: 'subject-secret-4', email: owner.user.email, emailVerified: false });
      await flow({ subject: 'subject-secret-5', email: owner.user.email, claims: { aud: ['x'] } });
      await flow({ subject: 'subject-secret-6', email: owner.user.email, claims: { nonce: 'n' } });
      await flow({ subject: 'subject-secret-7', userinfoSubject: 'subject-secret-8' });
      await flow({ subject: 'subject-secret-9' }, { state: 'forged-state-value' });
      const hostile = await begin();
      const refused = await integration.request(
        '/api/auth/oidc/callback?error=a%40b.example%20token%3Dabc',
        { cookie: hostile.cookie },
      );
      bodies.push(await refused.text(), location(refused) ?? '');
      const down = applyTestSettings({ OIDC_ISSUER: 'http://127.0.0.1:1' });
      try {
        resetOidcDiscovery();
        const failed = await integration.request('/api/auth/oidc/login');
        bodies.push(await failed.text(), location(failed) ?? '');
      } finally {
        down();
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }

    const output = [...lines, ...bodies].join('\n');
    expect(lines.some((line) => line.includes('oidc.'))).toBe(true);
    for (const secret of secrets) expect(output).not.toContain(secret);
    expect(output).not.toMatch(/access-[0-9a-f]{8}-|code-[0-9a-f]{8}-|eyJ[A-Za-z0-9_-]{6,}/);
    expect(output).not.toContain('example.com');
    // Every answer is a bare redirect to this site.
    for (let index = 0; index < bodies.length; index += 2) expect(bodies[index]).toBe('');
  });
});

describe('maintenance', () => {
  test('both routes refuse while a backup or restore holds the database', async () => {
    await db.delete(oidcLoginAttempts);
    const session = postgres(getConfig().adminDatabase.url.reveal(), {
      max: 1,
      onnotice: () => undefined,
    });
    try {
      await enterMaintenance(session, 5);
      const login = await integration.request('/api/auth/oidc/login');
      expect(location(login)).toBe('/welcome?sso=paused');
      const callback = await integration.request('/api/auth/oidc/callback?code=a&state=b');
      expect(location(callback)).toBe('/welcome?sso=paused');
      expect(await db.select().from(oidcLoginAttempts)).toHaveLength(0);
      await leaveMaintenance(session);
      expect(location(await integration.request('/api/auth/oidc/login'))).toContain(
        provider.issuer,
      );
    } finally {
      await session.end();
    }
  });
});

function sessionCookies(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  const session = header.match(/session=([^;]+)/)![1];
  const csrf = header.match(/csrf_token=([^;]+)/)![1];
  return `session=${session}; csrf_token=${csrf}`;
}

describe('unlinking from Settings', () => {
  const ADDRESS_PREFIX = '198.51.100.';
  let address = 0;
  const nextAddress = () => `${ADDRESS_PREFIX}${(address += 1)}`;

  async function linked(label: string, subject: string) {
    const account = await integration.signUp(label);
    const signedIn = await finish(await begin(), { subject, email: account.user.email });
    return { account, cookie: sessionCookies(signedIn) };
  }

  test('shows the link, and removes it only for the password', async () => {
    const { account, cookie } = await linked('owner-unlink', 'sub-unlink');
    const remoteAddress = nextAddress();
    const state = async () =>
      (
        (await (await integration.request('/api/settings/single-sign-on', { cookie })).json()) as {
          data: { linked: boolean; providerName: string | null };
        }
      ).data;
    expect(await state()).toEqual({ linked: true, providerName: 'Authelia' });

    const unlink = (json: unknown) =>
      integration.request('/api/settings/single-sign-on', {
        method: 'DELETE',
        cookie,
        json,
        remoteAddress,
      });
    expect((await unlink({})).status).toBe(400);
    expect((await unlink({ password: 'not the password' })).status).toBe(401);
    expect((await unlink({ password: 123 })).status).toBe(400);
    expect(await identitiesOf(account.user.id)).toHaveLength(1);

    const removed = await unlink({ password: integrationPassword });
    expect(removed.status).toBe(200);
    expect(await identitiesOf(account.user.id)).toHaveLength(0);
    expect(await state()).toEqual({ linked: false, providerName: 'Authelia' });
    // The session that asked stays signed in.
    expect(await userOf(cookie.match(/session=([^;]+)/)![1]!)).toBe(account.user.id);

    // The next provider sign-in links again by verified email, even as another subject.
    const again = await finish(await begin(), { subject: 'sub-new', email: account.user.email });
    expect(location(again)).toBe('/');
    expect((await identitiesOf(account.user.id)).map((row) => row.subject)).toEqual(['sub-new']);
  });

  test('is for the signed-in account only, and needs a session', async () => {
    const mine = await linked('owner-mine', 'sub-mine');
    const theirs = await linked('owner-theirs', 'sub-theirs');
    const anonymous = await integration.request('/api/settings/single-sign-on', {
      method: 'DELETE',
      json: { password: integrationPassword },
    });
    expect([401, 403]).toContain(anonymous.status);
    await integration.request('/api/settings/single-sign-on', {
      method: 'DELETE',
      cookie: mine.cookie,
      json: { password: integrationPassword },
      remoteAddress: nextAddress(),
    });
    expect(await identitiesOf(mine.account.user.id)).toHaveLength(0);
    expect(await identitiesOf(theirs.account.user.id)).toHaveLength(1);
  });

  test('limits wrong passwords like a password change', async () => {
    const { account, cookie } = await linked('owner-limited', 'sub-limited');
    const remoteAddress = nextAddress();
    const statuses: number[] = [];
    // The limiter is off in the test environment.
    const restoreLimits = applyTestSettings({ NODE_ENV: 'development' });
    try {
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const response = await integration.request('/api/settings/single-sign-on', {
          method: 'DELETE',
          cookie,
          json: { password: 'wrong password' },
          remoteAddress,
        });
        statuses.push(response.status);
      }
    } finally {
      restoreLimits();
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect(await identitiesOf(account.user.id)).toHaveLength(1);
  });

  test('says an unlinked account is unlinked', async () => {
    const account = await integration.signUp('owner-plain');
    const response = await integration.request('/api/settings/single-sign-on', {
      cookie: account.cookie,
    });
    expect(((await response.json()) as { data: { linked: boolean } }).data.linked).toBe(false);
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
