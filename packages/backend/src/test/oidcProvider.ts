import { createHash } from 'node:crypto';

// A stand-in OpenID Connect provider on a loopback port, for tests of single sign-on. It issues
// codes the test registers with `grant` and answers the token and userinfo endpoints like a real
// provider: it checks the client credentials, the redirect URI and the PKCE verifier.

export const FAKE_CLIENT_ID = 'quro-test';
export const FAKE_CLIENT_SECRET = 'test secret/with+symbols';
export const FAKE_REDIRECT_URI = 'https://quro.example/api/auth/oidc/callback';

export type FakeGrant = {
  nonce: string;
  challenge: string;
  subject: string;
  email?: string | null;
  emailVerified?: boolean;
  name?: string;
  /** Overrides for the ID token's claims, such as a wrong audience. */
  claims?: Record<string, unknown>;
  /** The subject the userinfo endpoint reports, when it should differ from the ID token's. */
  userinfoSubject?: string;
};

export type FakeProvider = {
  issuer: string;
  grant: (code: string, grant: FakeGrant) => void;
  /** Endpoints that answered, in order. */
  requests: string[];
  /** Document fields to replace in the discovery answer. */
  discovery: Record<string, unknown>;
  stop: () => void;
};

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.c2lnbmF0dXJl`;
}

const EXPECTED_BASIC = `Basic ${Buffer.from(
  `${encodeURIComponent(FAKE_CLIENT_ID)}:${encodeURIComponent(FAKE_CLIENT_SECRET).replace(/%20/g, '+')}`,
).toString('base64')}`;

type State = {
  grants: Map<string, FakeGrant>;
  tokens: Map<string, FakeGrant>;
  discovery: Record<string, unknown>;
};

function discoveryDocument(state: State, issuer: string): Response {
  return Response.json({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    ...state.discovery,
  });
}

async function tokenResponse(state: State, request: Request, issuer: string): Promise<Response> {
  if (request.headers.get('authorization') !== EXPECTED_BASIC) {
    return Response.json({ error: 'invalid_client' }, { status: 401 });
  }
  const form = new URLSearchParams(await request.text());
  const code = form.get('code') ?? '';
  const grant = state.grants.get(code);
  state.grants.delete(code);
  const challenge = createHash('sha256')
    .update(form.get('code_verifier') ?? '')
    .digest('base64url');
  const valid =
    grant !== undefined &&
    form.get('grant_type') === 'authorization_code' &&
    form.get('redirect_uri') === FAKE_REDIRECT_URI &&
    challenge === grant.challenge;
  if (!valid) return Response.json({ error: 'invalid_grant' }, { status: 400 });

  const accessToken = `access-${crypto.randomUUID()}`;
  state.tokens.set(accessToken, grant);
  const now = Math.floor(Date.now() / 1000);
  return Response.json({
    token_type: 'bearer',
    access_token: accessToken,
    id_token: jwt({
      iss: issuer,
      aud: [FAKE_CLIENT_ID],
      sub: grant.subject,
      nonce: grant.nonce,
      iat: now,
      exp: now + 3600,
      ...grant.claims,
    }),
  });
}

function userinfoResponse(state: State, request: Request): Response {
  const bearer = (request.headers.get('authorization') ?? '').slice('Bearer '.length);
  const grant = state.tokens.get(bearer);
  if (!grant) return Response.json({ error: 'invalid_token' }, { status: 401 });
  return Response.json({
    sub: grant.userinfoSubject ?? grant.subject,
    ...(grant.email === null ? {} : { email: grant.email }),
    email_verified: grant.emailVerified ?? true,
    name: grant.name ?? 'Test Person',
  });
}

export function startFakeProvider(): FakeProvider {
  const state: State = { grants: new Map(), tokens: new Map(), discovery: {} };
  const requests: string[] = [];

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const url = new URL(request.url);
      requests.push(url.pathname);
      if (url.pathname === '/.well-known/openid-configuration') {
        return discoveryDocument(state, url.origin);
      }
      if (url.pathname === '/token' && request.method === 'POST') {
        return tokenResponse(state, request, url.origin);
      }
      if (url.pathname === '/userinfo') return userinfoResponse(state, request);
      return new Response('not found', { status: 404 });
    },
  });

  return {
    issuer: `http://127.0.0.1:${server.port}`,
    grant: (code, grant) => state.grants.set(code, grant),
    requests,
    discovery: state.discovery,
    stop: () => void server.stop(true),
  };
}
