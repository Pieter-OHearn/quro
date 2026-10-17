import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import {
  OidcError,
  buildAuthorizationUrl,
  discoverEndpoints,
  exchangeCode,
  fetchIdentity,
  pkceChallenge,
  resetOidcDiscovery,
  verifyIdToken,
  type OidcClientSettings,
} from './oidcClient';
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_REDIRECT_URI,
  startFakeProvider,
  type FakeProvider,
} from '../test/oidcProvider';

let provider: FakeProvider;
let settings: OidcClientSettings;

beforeAll(() => {
  provider = startFakeProvider();
  settings = {
    issuer: provider.issuer,
    clientId: FAKE_CLIENT_ID,
    clientSecret: FAKE_CLIENT_SECRET,
    redirectUri: FAKE_REDIRECT_URI,
  };
});

afterEach(() => {
  resetOidcDiscovery();
  for (const key of Object.keys(provider.discovery)) delete provider.discovery[key];
});

afterAll(() => provider.stop());

function idToken(claims: Record<string, unknown>) {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.c2ln`;
}

const NOW = Date.UTC(2026, 9, 17, 12);
const goodClaims = () => ({
  iss: provider.issuer,
  aud: [FAKE_CLIENT_ID],
  sub: 'abc',
  nonce: 'n-1',
  exp: NOW / 1000 + 600,
});

describe('discovery', () => {
  test('reads the endpoints and keeps them for an hour', async () => {
    const endpoints = await discoverEndpoints(settings, NOW);
    expect(endpoints.token).toBe(`${provider.issuer}/token`);
    const before = provider.requests.length;
    await discoverEndpoints(settings, NOW + 59 * 60_000);
    expect(provider.requests.length).toBe(before);
    await discoverEndpoints(settings, NOW + 61 * 60_000);
    expect(provider.requests.length).toBe(before + 1);
  });

  test('refuses a document that belongs to another issuer', async () => {
    provider.discovery.issuer = 'https://elsewhere.example';
    await expect(discoverEndpoints(settings)).rejects.toThrow(OidcError);
  });

  test('refuses an endpoint that is not https', async () => {
    provider.discovery.token_endpoint = 'http://auth.example/token';
    await expect(discoverEndpoints(settings)).rejects.toThrow('not https');
  });

  test('refuses a document without a userinfo endpoint', async () => {
    provider.discovery.userinfo_endpoint = null;
    await expect(discoverEndpoints(settings)).rejects.toThrow('missing');
  });

  test('reports an unreachable provider without its address', async () => {
    const down = { ...settings, issuer: 'http://127.0.0.1:1' };
    const error = await discoverEndpoints(down).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OidcError);
    expect((error as Error).message).not.toContain('127.0.0.1');
  });
});

describe('authorization request', () => {
  test('asks for the code flow with PKCE, a state and a nonce', async () => {
    const endpoints = await discoverEndpoints(settings);
    const url = new URL(
      buildAuthorizationUrl(endpoints, settings, {
        state: 's',
        nonce: 'n',
        codeVerifier: 'verifier',
      }),
    );
    expect(url.origin + url.pathname).toBe(`${provider.issuer}/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: FAKE_CLIENT_ID,
      redirect_uri: FAKE_REDIRECT_URI,
      scope: 'openid profile email',
      state: 's',
      nonce: 'n',
      code_challenge: pkceChallenge('verifier'),
      code_challenge_method: 'S256',
    });
  });
});

describe('token exchange', () => {
  test('sends the client credentials and the PKCE verifier', async () => {
    const endpoints = await discoverEndpoints(settings);
    provider.grant('code-1', { nonce: 'n-1', challenge: pkceChallenge('v-1'), subject: 'abc' });
    const tokens = await exchangeCode(endpoints, settings, 'code-1', 'v-1');
    expect(verifyIdToken(tokens.idToken, settings, 'n-1')).toBe('abc');
  });

  test('fails when the provider refuses the code', async () => {
    const endpoints = await discoverEndpoints(settings);
    await expect(exchangeCode(endpoints, settings, 'unknown', 'v')).rejects.toThrow('status 400');
  });

  test('fails when the verifier does not match the challenge', async () => {
    const endpoints = await discoverEndpoints(settings);
    provider.grant('code-2', { nonce: 'n', challenge: pkceChallenge('right'), subject: 'abc' });
    await expect(exchangeCode(endpoints, settings, 'code-2', 'wrong')).rejects.toThrow(
      'status 400',
    );
  });

  test('fails when the client secret is wrong', async () => {
    const endpoints = await discoverEndpoints(settings);
    const wrong = { ...settings, clientSecret: 'nope' };
    await expect(exchangeCode(endpoints, wrong, 'code', 'v')).rejects.toThrow('status 401');
  });
});

describe('ID token', () => {
  test('accepts a token for this client and sign-in', () => {
    expect(verifyIdToken(idToken(goodClaims()), settings, 'n-1', NOW)).toBe('abc');
  });

  test.each([
    ['another issuer', { iss: 'https://evil.example' }, 'wrong issuer'],
    ['another audience', { aud: ['someone-else'] }, 'wrong audience'],
    ['several audiences without azp', { aud: [FAKE_CLIENT_ID, 'other'] }, 'authorized party'],
    ['a stale expiry', { exp: NOW / 1000 - 120 }, 'expired'],
    ['no expiry', { exp: undefined }, 'expired'],
    ['another nonce', { nonce: 'n-2' }, 'wrong nonce'],
    ['no subject', { sub: '' }, 'no subject'],
  ])('rejects %s', (_label, change, message) => {
    const claims = { ...goodClaims(), ...change };
    expect(() => verifyIdToken(idToken(claims), settings, 'n-1', NOW)).toThrow(message);
  });

  test('accepts several audiences when azp names this client', () => {
    const claims = { ...goodClaims(), aud: [FAKE_CLIENT_ID, 'other'], azp: FAKE_CLIENT_ID };
    expect(verifyIdToken(idToken(claims), settings, 'n-1', NOW)).toBe('abc');
  });

  test('rejects something that is not a JWT', () => {
    expect(() => verifyIdToken('nonsense', settings, 'n-1', NOW)).toThrow('not a JWT');
    expect(() => verifyIdToken('a.!!.c', settings, 'n-1', NOW)).toThrow('JSON object');
  });
});

describe('userinfo', () => {
  async function tokenFor(extra: {
    email?: string | null;
    emailVerified?: boolean;
    userinfoSubject?: string;
  }) {
    const endpoints = await discoverEndpoints(settings);
    const code = `code-${crypto.randomUUID()}`;
    provider.grant(code, {
      nonce: 'n',
      challenge: pkceChallenge('v'),
      subject: 'abc',
      email: 'Person@Example.com',
      ...extra,
    });
    const { accessToken } = await exchangeCode(endpoints, settings, code, 'v');
    return { endpoints, accessToken };
  }

  test('lowercases the email and reports whether the provider verified it', async () => {
    const { endpoints, accessToken } = await tokenFor({});
    expect(await fetchIdentity(endpoints, accessToken, 'abc')).toEqual({
      subject: 'abc',
      email: 'person@example.com',
      emailVerified: true,
      name: 'Test Person',
    });
    const unverified = await tokenFor({ emailVerified: false });
    expect(
      (await fetchIdentity(unverified.endpoints, unverified.accessToken, 'abc')).emailVerified,
    ).toBe(false);
  });

  test('has no email when the provider sends none', async () => {
    const { endpoints, accessToken } = await tokenFor({ email: null });
    expect((await fetchIdentity(endpoints, accessToken, 'abc')).email).toBeNull();
  });

  test('refuses a profile of another subject', async () => {
    const { endpoints, accessToken } = await tokenFor({ userinfoSubject: 'someone-else' });
    await expect(fetchIdentity(endpoints, accessToken, 'abc')).rejects.toThrow('subject differs');
  });

  test('fails for a token the provider does not know', async () => {
    const endpoints = await discoverEndpoints(settings);
    await expect(fetchIdentity(endpoints, 'unknown', 'abc')).rejects.toThrow('status 401');
  });
});
