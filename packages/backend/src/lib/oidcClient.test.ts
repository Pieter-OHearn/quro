import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { SignJWT } from 'jose';
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
  newSigningKey,
  startFakeProvider,
  type SigningAlgorithm,
  type FakeProvider,
} from '../test/oidcProvider';

let provider: FakeProvider;
let settings: OidcClientSettings;

beforeAll(async () => {
  provider = await startFakeProvider();
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

const signed = (claims: Record<string, unknown>) => provider.sign(claims);
const unsignedPart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const verify = async (token: string, now = NOW, nonce = 'n-1') =>
  verifyIdToken(token, await discoverEndpoints(settings, now), FAKE_CLIENT_ID, nonce, now);

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 9, 17, 12);
const goodClaims = () => ({
  iss: provider.issuer,
  aud: [FAKE_CLIENT_ID],
  sub: 'abc',
  nonce: 'n-1',
  iat: NOW / 1000,
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

  test('refuses plain http endpoints from a provider that is served over https', async () => {
    const secure = { ...settings, issuer: 'https://auth.example' };
    const document = (token: string) =>
      Response.json({
        issuer: 'https://auth.example',
        authorization_endpoint: 'https://auth.example/authorize',
        token_endpoint: token,
        userinfo_endpoint: 'https://auth.example/userinfo',
        jwks_uri: 'https://auth.example/jwks',
      });
    const fetchSpy = spyOn(globalThis, 'fetch');
    try {
      for (const token of [
        'http://127.0.0.1:9/token',
        'http://localhost/token',
        'https://user:pass@auth.example/token',
        'ftp://auth.example/token',
      ]) {
        resetOidcDiscovery();
        fetchSpy.mockResolvedValueOnce(document(token));
        await expect(discoverEndpoints(secure)).rejects.toThrow('not https');
      }
      resetOidcDiscovery();
      fetchSpy.mockResolvedValueOnce(document('https://login.example/token'));
      expect((await discoverEndpoints(secure)).token).toBe('https://login.example/token');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('names the issuer exactly as the document spells it', async () => {
    provider.discovery.issuer = `${provider.issuer}/`;
    const endpoints = await discoverEndpoints(settings);
    expect(endpoints.issuer).toBe(`${provider.issuer}/`);
    const slash = await signed({ ...goodClaims(), iss: `${provider.issuer}/` });
    expect(await verify(slash)).toBe('abc');
    // The other spelling is a different issuer.
    const bare = await signed({ ...goodClaims(), iss: provider.issuer });
    await expect(verify(bare)).rejects.toThrow('wrong issuer');
  });

  test('refuses a document without a signing key address, or an insecure one', async () => {
    provider.discovery.jwks_uri = undefined;
    await expect(discoverEndpoints(settings)).rejects.toThrow('missing');
    resetOidcDiscovery();
    provider.discovery.jwks_uri = 'ftp://keys.example/jwks';
    await expect(discoverEndpoints(settings)).rejects.toThrow('not https');
  });

  test('does not follow a redirect, so a secret is not sent on', async () => {
    let reachedElsewhere = 0;
    const elsewhere = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => {
        reachedElsewhere += 1;
        return new Response('x');
      },
    });
    const redirecting = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => Response.redirect(`http://localhost:${elsewhere.port}/`, 302),
    });
    try {
      const moved = { ...settings, issuer: `http://127.0.0.1:${redirecting.port}` };
      await expect(discoverEndpoints(moved)).rejects.toThrow(OidcError);
      // A token endpoint that redirects is refused too, and never receives the client secret.
      const endpoints = {
        issuer: moved.issuer,
        authorization: `${moved.issuer}/a`,
        token: `${moved.issuer}/t`,
        userinfo: `${moved.issuer}/u`,
        jwks: `${moved.issuer}/k`,
      };
      await expect(exchangeCode(endpoints, settings, 'code', 'verifier')).rejects.toThrow(
        OidcError,
      );
      expect(reachedElsewhere).toBe(0);
    } finally {
      await redirecting.stop(true);
      await elsewhere.stop(true);
    }
  });

  test('refuses an answer that is too large', async () => {
    const big = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response(JSON.stringify({ filler: 'x'.repeat(1_100_000) })),
    });
    try {
      const huge = { ...settings, issuer: `http://127.0.0.1:${big.port}` };
      await expect(discoverEndpoints(huge)).rejects.toThrow('too large');
    } finally {
      await big.stop(true);
    }
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
    // It names the class of the failure, which is what an operator needs to tell a refused
    // connection from a certificate that does not verify.
    expect((error as OidcError).detail).toMatch(
      /^the provider did not answer( \([A-Za-z0-9_]+\))?$/,
    );
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
    expect(await verifyIdToken(tokens.idToken, endpoints, FAKE_CLIENT_ID, 'n-1')).toBe('abc');
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
  test('accepts a token for this client and sign-in', async () => {
    expect(await verify(await signed(goodClaims()))).toBe('abc');
  });

  test.each(['ES256', 'RS256', 'PS256', 'EdDSA'] as SigningAlgorithm[])(
    'accepts a %s signature from the published key',
    async (alg) => {
      const original = provider.key;
      try {
        await provider.rotateKey(alg);
        expect(await verify(await signed(goodClaims()))).toBe('abc');
      } finally {
        await provider.rotateKey(original.alg);
      }
    },
  );

  test('refuses a signature from a key the provider does not publish', async () => {
    const stranger = await newSigningKey(provider.key.alg);
    // Under the published key's id, so the right key is chosen and the signature fails.
    const sameId = { ...stranger, kid: provider.key.kid };
    const forged = await provider.sign(goodClaims(), { key: sameId });
    await expect(verify(forged)).rejects.toThrow('does not verify');
    // Under its own id, which the provider does not publish at all.
    const unknown = await provider.sign(goodClaims(), { key: stranger });
    await expect(verify(unknown, NOW + 2 * MINUTE)).rejects.toThrow('no signing key matches');
  });

  test('refuses a payload that was changed after signing', async () => {
    const [header, , signature] = (await signed(goodClaims())).split('.');
    const payload = unsignedPart({ ...goodClaims(), sub: 'someone-else' });
    await expect(verify(`${header}.${payload}.${signature}`)).rejects.toThrow('does not verify');
  });

  test('refuses an unsigned token and the algorithm `none`', async () => {
    const header = unsignedPart({ alg: 'none', typ: 'JWT' });
    const payload = unsignedPart(goodClaims());
    await expect(verify(`${header}.${payload}.`)).rejects.toThrow('algorithm is not allowed');
    const stripped = (await signed(goodClaims())).split('.').slice(0, 2).join('.') + '.';
    await expect(verify(stripped)).rejects.toThrow();
  });

  test('refuses HMAC algorithms, even keyed with the provider public key', async () => {
    const secret = new TextEncoder().encode(JSON.stringify(provider.key.jwk));
    for (const alg of ['HS256', 'HS384', 'HS512']) {
      const token = await new SignJWT(goodClaims())
        .setProtectedHeader({ alg, kid: provider.key.kid })
        .sign(secret);
      await expect(verify(token)).rejects.toThrow('algorithm is not allowed');
    }
  });

  test('finds a rotated key once, and not more often than the interval', async () => {
    const original = provider.key;
    try {
      await verify(await signed(goodClaims()));
      const rotated = await provider.rotateKey('ES256');
      const token = await provider.sign(goodClaims(), { key: rotated });
      const fetches = () => provider.requests.filter((path) => path === '/jwks').length;
      const before = fetches();
      // Inside the interval the cached keys are not asked again.
      await expect(verify(token, NOW + 10_000)).rejects.toThrow('no signing key matches');
      expect(fetches()).toBe(before);
      // After it, one fetch finds the new key.
      expect(await verify(token, NOW + 2 * MINUTE)).toBe('abc');
      expect(fetches()).toBe(before + 1);
      // Tokens with invented key ids cause no further fetching within the interval.
      const invented = await provider.sign(goodClaims(), {
        key: { ...rotated, kid: 'invented' },
      });
      for (let index = 0; index < 5; index += 1) {
        await expect(verify(invented, NOW + 2 * MINUTE + 1000)).rejects.toThrow();
      }
      expect(fetches()).toBe(before + 1);
    } finally {
      await provider.rotateKey(original.alg);
    }
  });

  test.each([
    ['another issuer', { iss: 'https://evil.example' }, 'wrong issuer'],
    ['no issuer', { iss: undefined }, 'wrong issuer'],
    ['another audience', { aud: ['someone-else'] }, 'wrong audience'],
    ['no audience', { aud: undefined }, 'wrong audience'],
    ['several audiences without azp', { aud: [FAKE_CLIENT_ID, 'other'] }, 'authorized party'],
    ['a stale expiry', { exp: NOW / 1000 - 120 }, 'expired'],
    ['no expiry', { exp: undefined }, 'expired'],
    ['not yet valid', { nbf: NOW / 1000 + 600 }, 'expired'],
    ['issued in the future', { iat: NOW / 1000 + 600 }, 'future'],
    ['no issue time', { iat: undefined }, 'missing'],
    ['another nonce', { nonce: 'n-2' }, 'wrong nonce'],
    ['no nonce', { nonce: undefined }, 'wrong nonce'],
    ['no subject', { sub: '' }, 'no subject'],
  ])('rejects %s', async (_label, change, message) => {
    const token = await signed({ ...goodClaims(), ...change });
    await expect(verify(token)).rejects.toThrow(message);
  });

  test('allows a minute of clock skew', async () => {
    expect(await verify(await signed({ ...goodClaims(), exp: NOW / 1000 - 30 }))).toBe('abc');
    expect(await verify(await signed({ ...goodClaims(), iat: NOW / 1000 + 30 }))).toBe('abc');
  });

  test('accepts several audiences when azp names this client', async () => {
    const claims = { ...goodClaims(), aud: [FAKE_CLIENT_ID, 'other'], azp: FAKE_CLIENT_ID };
    expect(await verify(await signed(claims))).toBe('abc');
  });

  test('rejects something that is not a JWT', async () => {
    await expect(verify('nonsense')).rejects.toThrow('not a JWT');
    await expect(verify('a.!!.c')).rejects.toThrow('not a JWT');
  });

  test('reports keys that cannot be fetched as an ID token failure without the address', async () => {
    provider.discovery.jwks_uri = 'http://127.0.0.1:1/jwks';
    const error = await verify(await signed(goodClaims())).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OidcError);
    expect((error as OidcError).reason).toBe('id_token');
    expect((error as Error).message).not.toContain('127.0.0.1');
  });

  test('refuses key sets that are too large, empty or not a key set', async () => {
    const answers: unknown[] = [
      { filler: 'x'.repeat(1_100_000), keys: [] },
      { keys: Array.from({ length: 60 }, () => provider.key.jwk) },
      { keys: [] },
      { keys: 'nope' },
    ];
    let next = 0;
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => Response.json(answers[next++]),
    });
    try {
      provider.discovery.jwks_uri = `http://127.0.0.1:${server.port}/jwks`;
      const token = await signed(goodClaims());
      for (let index = 0; index < answers.length; index += 1) {
        resetOidcDiscovery();
        await expect(verify(token)).rejects.toThrow(OidcError);
      }
    } finally {
      await server.stop(true);
    }
  });

  test('does not follow a redirect from the key address', async () => {
    let reached = 0;
    const elsewhere = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => {
        reached += 1;
        return Response.json({ keys: [provider.key.jwk] });
      },
    });
    const redirecting = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => Response.redirect(`http://localhost:${elsewhere.port}/jwks`, 302),
    });
    try {
      provider.discovery.jwks_uri = `http://127.0.0.1:${redirecting.port}/jwks`;
      await expect(verify(await signed(goodClaims()))).rejects.toThrow(OidcError);
      expect(reached).toBe(0);
    } finally {
      await redirecting.stop(true);
      await elsewhere.stop(true);
    }
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
