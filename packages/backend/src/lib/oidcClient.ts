import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { LOOPBACK_HOSTNAMES } from '../config/settings';
import { MINUTE_MS, MS_PER_SECOND } from '../constants/time';

// The OpenID Connect authorization code flow with PKCE, as a relying party. It talks to the
// provider's endpoints from discovery and holds no state; lib/oidcLogin.ts records the sign-ins.
//
// The ID token arrives from the token endpoint over TLS, so its claims are checked (issuer,
// audience, expiry, nonce) without verifying its signature, which OpenID Connect Core 3.1.3.7
// allows for a token received directly from the token endpoint. The user's email address and name
// come from the userinfo endpoint, which the provider answers for the access token only.

const REQUEST_TIMEOUT_MS = 10 * MS_PER_SECOND;
const DISCOVERY_CACHE_MS = 60 * MINUTE_MS;
const CLOCK_SKEW_MS = MINUTE_MS;
const SECRET_BYTES = 32;
const MAX_RESPONSE_BYTES = 1_000_000;
const SCOPES = 'openid profile email';

export type OidcClientSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type OidcEndpoints = {
  /** The issuer exactly as the provider's discovery document names it. */
  issuer: string;
  authorization: string;
  token: string;
  userinfo: string;
};

export type OidcIdentity = {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
};

/** Why a sign-in could not be completed. The message never carries a token or a response body. */
export class OidcError extends Error {
  constructor(
    readonly reason: 'discovery' | 'token' | 'id_token' | 'userinfo',
    readonly detail: string,
  ) {
    super(`${reason}: ${detail}`);
    this.name = 'OidcError';
  }
}

export function randomUrlToken(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isLoopbackHttp(url: URL): boolean {
  return url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname);
}

// An endpoint is https. Plain http on loopback is allowed only when the issuer is itself plain
// http on loopback, so a document served over TLS cannot send the client secret or the
// authorization code over plain http, even to the same machine.
function isSecureEndpoint(value: unknown, issuer: string): value is string {
  if (typeof value !== 'string' || !URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.username || url.password) return false;
  return url.protocol === 'https:' || (isLoopbackHttp(url) && isLoopbackHttp(new URL(issuer)));
}

let discovered: { key: string; at: number; endpoints: OidcEndpoints } | null = null;

/** Forgets the cached discovery document. Tests call it between providers. */
export function resetOidcDiscovery(): void {
  discovered = null;
}

/** One request to the provider, answered with a JSON object. Errors name the step, not the body. */
async function requestJson(
  step: OidcError['reason'],
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, {
      ...init,
      // A redirect would send the request, and for the token endpoint the client secret, on.
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new OidcError(step, `status ${response.status}`);
    const text = await readBounded(response, step);
    const body: unknown = JSON.parse(text);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new OidcError(step, 'the answer is not a JSON object');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OidcError) throw error;
    throw new OidcError(step, `the provider did not answer${networkErrorCode(error)}`);
  }
}

// The class of a failed request, such as a certificate that does not verify, without its address.
function networkErrorCode(error: unknown): string {
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
  const label = typeof code === 'string' ? code : name;
  return typeof label === 'string' && /^[A-Za-z0-9_]{2,60}$/.test(label) ? ` (${label})` : '';
}

// Reads the body up to the limit, so a provider cannot make the backend buffer a huge answer.
async function readBounded(response: Response, step: OidcError['reason']): Promise<string> {
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_RESPONSE_BYTES) throw new OidcError(step, 'the answer is too large');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new OidcError(step, 'the answer is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function readEndpoints(document: Record<string, unknown>, issuer: string): OidcEndpoints {
  // The document must belong to the issuer it was fetched for (RFC 8414 3.3). The ID token's
  // `iss` is later compared with the document's own spelling, character for character.
  const named = document.issuer;
  if (typeof named !== 'string' || named.replace(/\/+$/, '') !== issuer) {
    throw new OidcError('discovery', 'the issuer in the document is not the configured issuer');
  }
  const authorization = document.authorization_endpoint;
  const token = document.token_endpoint;
  const userinfo = document.userinfo_endpoint;
  if (
    !isSecureEndpoint(authorization, issuer) ||
    !isSecureEndpoint(token, issuer) ||
    !isSecureEndpoint(userinfo, issuer)
  ) {
    throw new OidcError('discovery', 'an endpoint is missing or not https');
  }
  return { issuer: named, authorization, token, userinfo };
}

/** The provider's endpoints, read from its discovery document and kept for an hour. */
export async function discoverEndpoints(
  settings: Pick<OidcClientSettings, 'issuer'>,
  now = Date.now(),
): Promise<OidcEndpoints> {
  if (discovered?.key === settings.issuer && now - discovered.at < DISCOVERY_CACHE_MS) {
    return discovered.endpoints;
  }
  const document = await requestJson(
    'discovery',
    `${settings.issuer}/.well-known/openid-configuration`,
    { headers: { accept: 'application/json' } },
  );
  const endpoints = readEndpoints(document, settings.issuer);
  discovered = { key: settings.issuer, at: now, endpoints };
  return endpoints;
}

export function buildAuthorizationUrl(
  endpoints: OidcEndpoints,
  settings: OidcClientSettings,
  attempt: { state: string; nonce: string; codeVerifier: string },
): string {
  const url = new URL(endpoints.authorization);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', settings.clientId);
  url.searchParams.set('redirect_uri', settings.redirectUri);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', attempt.state);
  url.searchParams.set('nonce', attempt.nonce);
  url.searchParams.set('code_challenge', pkceChallenge(attempt.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

// RFC 6749 2.3.1: the id and secret are form-encoded before they are joined for Basic.
function basicCredentials({ clientId, clientSecret }: OidcClientSettings): string {
  const form = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');
  return `Basic ${Buffer.from(`${form(clientId)}:${form(clientSecret)}`).toString('base64')}`;
}

type TokenResponse = { accessToken: string; idToken: string };

export async function exchangeCode(
  endpoints: OidcEndpoints,
  settings: OidcClientSettings,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = await requestJson('token', endpoints.token, {
    method: 'POST',
    headers: {
      authorization: basicCredentials(settings),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: settings.redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const { access_token: accessToken, id_token: idToken, token_type: tokenType } = body;
  if (
    typeof accessToken !== 'string' ||
    typeof idToken !== 'string' ||
    typeof tokenType !== 'string' ||
    tokenType.toLowerCase() !== 'bearer'
  ) {
    throw new OidcError('token', 'the response has no bearer access token and ID token');
  }
  return { accessToken, idToken };
}

function readClaims(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new OidcError('id_token', 'not a JWT');
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    if (typeof claims === 'object' && claims !== null && !Array.isArray(claims)) {
      return claims as Record<string, unknown>;
    }
  } catch {
    // Falls through to the error below.
  }
  throw new OidcError('id_token', 'the payload is not a JSON object');
}

function checkAudience(claims: Record<string, unknown>, clientId: string): void {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId)) throw new OidcError('id_token', 'wrong audience');
  if (audience.length > 1 && claims.azp !== clientId) {
    throw new OidcError('id_token', 'wrong authorized party');
  }
}

function isExpired(claims: Record<string, unknown>, now: number): boolean {
  return typeof claims.exp !== 'number' || claims.exp * MS_PER_SECOND + CLOCK_SKEW_MS < now;
}

/**
 * Checks the ID token's claims against this sign-in and returns the subject. `issuer` is the one
 * the discovery document names, and `iss` must equal it exactly.
 */
export function verifyIdToken(
  idToken: string,
  expected: { issuer: string; clientId: string },
  nonce: string,
  now = Date.now(),
): string {
  const claims = readClaims(idToken);
  if (claims.iss !== expected.issuer) throw new OidcError('id_token', 'wrong issuer');
  checkAudience(claims, expected.clientId);
  if (isExpired(claims, now)) throw new OidcError('id_token', 'expired');
  if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, nonce)) {
    throw new OidcError('id_token', 'wrong nonce');
  }
  if (typeof claims.sub !== 'string' || claims.sub === '') {
    throw new OidcError('id_token', 'no subject');
  }
  return claims.sub;
}

/** The person's profile from the userinfo endpoint, which must describe the ID token's subject. */
export async function fetchIdentity(
  endpoints: OidcEndpoints,
  accessToken: string,
  subject: string,
): Promise<OidcIdentity> {
  const body = await requestJson('userinfo', endpoints.userinfo, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (body.sub !== subject)
    throw new OidcError('userinfo', 'the subject differs from the ID token');
  const { email, name } = body;
  return {
    subject,
    email: typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : null,
    emailVerified: body.email_verified === true || body.email_verified === 'true',
    name: typeof name === 'string' && name.trim() !== '' ? name.trim() : null,
  };
}
