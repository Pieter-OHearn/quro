import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createLocalJWKSet, decodeProtectedHeader, errors, jwtVerify, type JWTPayload } from 'jose';
import { LOOPBACK_HOSTNAMES } from '../config/settings';
import { MINUTE_MS, MS_PER_SECOND } from '../constants/time';

// The OpenID Connect authorization code flow with PKCE, as a relying party. It talks to the
// provider's endpoints from discovery and holds no state; lib/oidcLogin.ts records the sign-ins.
//
// The ID token arrives from the token endpoint over TLS and its signature is verified against the
// provider's published keys (`jwks_uri` from the discovery document), with an allowlist of
// algorithms, before any of its claims is trusted. The user's email address and name come from the
// userinfo endpoint, which the provider answers for the access token only.

const REQUEST_TIMEOUT_MS = 10 * MS_PER_SECOND;
const DISCOVERY_CACHE_MS = 60 * MINUTE_MS;
const CLOCK_SKEW_MS = MINUTE_MS;
const SECRET_BYTES = 32;
const MAX_RESPONSE_BYTES = 1_000_000;
const SCOPES = 'openid profile email';
// Only asymmetric algorithms. `none` and every HMAC algorithm are refused: a shared secret cannot
// be told apart from the public key a client is handed.
const ID_TOKEN_ALGORITHMS = ['RS256', 'PS256', 'ES256', 'EdDSA'];
const MAX_JWKS_KEYS = 50;
// The keys are fetched again at most this often when a token names a key that is not cached, so a
// stream of tokens with made-up key ids cannot make the backend fetch without end.
const JWKS_REFETCH_MS = MINUTE_MS;
const JWKS_CACHE_MS = 60 * MINUTE_MS;

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
  /** Where the provider publishes the public keys its ID tokens are signed with. */
  jwks: string;
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
  jwksCache = null;
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
  const jwks = document.jwks_uri;
  if (
    !isSecureEndpoint(authorization, issuer) ||
    !isSecureEndpoint(token, issuer) ||
    !isSecureEndpoint(userinfo, issuer) ||
    !isSecureEndpoint(jwks, issuer)
  ) {
    throw new OidcError('discovery', 'an endpoint is missing or not https');
  }
  return { issuer: named, authorization, token, userinfo, jwks };
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

type Jwks = { keys: Record<string, unknown>[] };
let jwksCache: { uri: string; at: number; jwks: Jwks } | null = null;

async function fetchJwks(uri: string, now: number): Promise<Jwks> {
  const { keys } = await requestJson('id_token', uri, { headers: { accept: 'application/json' } });
  const isObject = (key: unknown) => typeof key === 'object' && key !== null && !Array.isArray(key);
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_JWKS_KEYS) {
    throw new OidcError('id_token', 'the signing keys are not a usable key set');
  }
  if (!keys.every(isObject)) {
    throw new OidcError('id_token', 'the signing keys are not a usable key set');
  }
  const jwks = { keys: keys as Record<string, unknown>[] };
  jwksCache = { uri, at: now, jwks };
  return jwks;
}

/** The provider's keys, kept for an hour. */
function cachedJwks(uri: string, now: number): Jwks | null {
  return jwksCache?.uri === uri && now - jwksCache.at < JWKS_CACHE_MS ? jwksCache.jwks : null;
}

/**
 * The keys again, for a token that names one that is not cached: at most once a minute, and null
 * when the interval has not passed, so made-up key ids cannot make the backend fetch without end.
 */
function refetchJwks(uri: string, now: number): Promise<Jwks | null> {
  if (jwksCache?.uri === uri && now - jwksCache.at < JWKS_REFETCH_MS) return Promise.resolve(null);
  return fetchJwks(uri, now);
}

const CLAIM_FAILURES: Record<string, string> = {
  iss: 'wrong issuer',
  aud: 'wrong audience',
  exp: 'expired',
  nbf: 'expired',
  iat: 'a claim is missing',
  sub: 'no subject',
};

// A fixed description per failure: nothing of the token or the provider's answer is carried.
function mapVerificationError(error: unknown): OidcError {
  if (error instanceof OidcError) return error;
  if (error instanceof errors.JWTClaimValidationFailed) {
    return new OidcError('id_token', CLAIM_FAILURES[error.claim] ?? 'a claim is not acceptable');
  }
  const known: [new (...args: never[]) => Error, string][] = [
    [errors.JWTExpired, 'expired'],
    [errors.JWSSignatureVerificationFailed, 'the signature does not verify'],
    [errors.JOSEAlgNotAllowed, 'the algorithm is not allowed'],
    [errors.JWKSNoMatchingKey, 'no signing key matches'],
  ];
  const match = known.find(([type]) => error instanceof type);
  return new OidcError('id_token', match ? match[1] : 'not a valid JWT');
}

function readAlgorithm(idToken: string): void {
  let algorithm: string | undefined;
  try {
    algorithm = decodeProtectedHeader(idToken).alg;
  } catch {
    throw new OidcError('id_token', 'not a JWT');
  }
  if (algorithm === undefined || !ID_TOKEN_ALGORITHMS.includes(algorithm)) {
    throw new OidcError('id_token', 'the algorithm is not allowed');
  }
}

async function verifySignedClaims(
  idToken: string,
  endpoints: Pick<OidcEndpoints, 'issuer' | 'jwks'>,
  clientId: string,
  now: number,
): Promise<JWTPayload> {
  const verify = async (jwks: Jwks) => {
    const { payload } = await jwtVerify(idToken, createLocalJWKSet(jwks as never), {
      issuer: endpoints.issuer,
      audience: clientId,
      algorithms: ID_TOKEN_ALGORITHMS,
      clockTolerance: CLOCK_SKEW_MS / MS_PER_SECOND,
      currentDate: new Date(now),
      requiredClaims: ['iss', 'aud', 'exp', 'iat', 'sub'],
    });
    return payload;
  };
  try {
    return await verify(cachedJwks(endpoints.jwks, now) ?? (await fetchJwks(endpoints.jwks, now)));
  } catch (error) {
    if (!(error instanceof errors.JWKSNoMatchingKey)) throw mapVerificationError(error);
    // The provider may have rotated its keys: look once more, if the interval allows it.
    try {
      const fresh = await refetchJwks(endpoints.jwks, now);
      if (!fresh) throw error;
      return await verify(fresh);
    } catch (second) {
      throw mapVerificationError(second);
    }
  }
}

function checkClaims(claims: JWTPayload, clientId: string, nonce: string, now: number): string {
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (audience.length > 1 && claims.azp !== clientId) {
    throw new OidcError('id_token', 'wrong authorized party');
  }
  if (typeof claims.iat !== 'number' || claims.iat * MS_PER_SECOND - CLOCK_SKEW_MS > now) {
    throw new OidcError('id_token', 'issued in the future');
  }
  if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, nonce)) {
    throw new OidcError('id_token', 'wrong nonce');
  }
  if (typeof claims.sub !== 'string' || claims.sub === '') {
    throw new OidcError('id_token', 'no subject');
  }
  return claims.sub;
}

/**
 * Verifies the ID token's signature against the provider's keys, checks its claims against this
 * sign-in and returns the subject. `iss` must equal the discovery document's issuer exactly.
 */
export async function verifyIdToken(
  idToken: string,
  endpoints: Pick<OidcEndpoints, 'issuer' | 'jwks'>,
  clientId: string,
  nonce: string,
  now = Date.now(),
): Promise<string> {
  readAlgorithm(idToken);
  const claims = await verifySignedClaims(idToken, endpoints, clientId, now);
  return checkClaims(claims, clientId, nonce, now);
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
