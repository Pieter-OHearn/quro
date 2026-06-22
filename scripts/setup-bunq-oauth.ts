#!/usr/bin/env bun
/**
 * setup-bunq-oauth.ts
 *
 * Registers a production bunq OAuth client via the API and writes the
 * BUNQ_CLIENT_ID / BUNQ_CLIENT_SECRET / BUNQ_REDIRECT_URI env vars to a local
 * file with restricted permissions.
 *
 * Usage:
 *   bun run scripts/setup-bunq-oauth.ts <API_KEY> <REDIRECT_URI>
 *
 * Example:
 *   bun run scripts/setup-bunq-oauth.ts sandbox_abc123 http://quro.local/api/bunq/oauth/callback
 *
 * You can get a production API key from the bunq app:
 *   Profile → Security & Preferences → Developers → API keys → Add API key
 */

import { Buffer } from 'node:buffer';
import { generateKeyPairSync, randomUUID, webcrypto } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';

const API_BASE = 'https://api.bunq.com/v1';
const APP_NAME = 'Quro';
const OUTPUT_ENV_PATH = '.env.bunq-oauth';
const SIGNATURE_ALGORITHM = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
const textEncoder = new TextEncoder();

// ── Args ──────────────────────────────────────────────────────────────────────

const [apiKey, redirectUri] = process.argv.slice(2);

if (!apiKey || !redirectUri) {
  console.error('Usage: bun run scripts/setup-bunq-oauth.ts <API_KEY> <REDIRECT_URI>');
  process.exit(1);
}

// ── Key pair ──────────────────────────────────────────────────────────────────

console.log('🔑 Generating RSA-2048 key pair…');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const signingKey = await webcrypto.subtle.importKey(
  'pkcs8',
  pemToArrayBuffer(privateKey),
  SIGNATURE_ALGORITHM,
  false,
  ['sign'],
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const bytes = Buffer.from(base64, 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function signRequestBody(body: string): Promise<string> {
  const signature = await webcrypto.subtle.sign(
    SIGNATURE_ALGORITHM,
    signingKey,
    textEncoder.encode(body),
  );
  return Buffer.from(signature).toString('base64');
}

function commonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'User-Agent': `${APP_NAME}/1.0`,
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'X-Bunq-Geolocation': '0 0 0 0 000',
    'X-Bunq-Client-Request-Id': randomUUID(),
  };
}

async function baseHeaders(authToken: string, body: string): Promise<Record<string, string>> {
  return {
    ...commonHeaders(),
    'X-Bunq-Client-Authentication': authToken,
    'X-Bunq-Client-Signature': await signRequestBody(body),
  };
}

async function bunqPost<T>(path: string, authToken: string, payload: unknown): Promise<T> {
  const body = JSON.stringify(payload);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await baseHeaders(authToken, body),
    body,
  });
  const json = (await res.json()) as {
    Response?: unknown[];
    Error?: { error_description: string }[];
  };
  if (!res.ok) {
    const msg = json.Error?.[0]?.error_description ?? `HTTP ${res.status}`;
    throw new Error(`POST ${path} failed: ${msg}`);
  }
  return json as T;
}

async function bunqGet<T>(path: string, authToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: await baseHeaders(authToken, ''),
  });
  const json = (await res.json()) as {
    Response?: unknown[];
    Error?: { error_description: string }[];
  };
  if (!res.ok) {
    const msg = json.Error?.[0]?.error_description ?? `HTTP ${res.status}`;
    throw new Error(`GET ${path} failed: ${msg}`);
  }
  return json as T;
}

function extractField<T>(response: unknown[], typeName: string, field: string): T {
  for (const item of response) {
    const rec = item as Record<string, unknown>;
    const inner = rec[typeName] as Record<string, unknown> | undefined;
    if (inner?.[field] !== undefined) return inner[field] as T;
  }
  throw new Error(`Could not find ${typeName}.${field} in response`);
}

// ── Step 1: Installation ──────────────────────────────────────────────────────

console.log('\n📡 Step 1: POST /installation');
const installBody = JSON.stringify({ client_public_key: publicKey });
const installHttpRes = await fetch(`${API_BASE}/installation`, {
  method: 'POST',
  headers: commonHeaders(),
  body: installBody,
});
const installJson = (await installHttpRes.json()) as {
  Response: unknown[];
  Error?: { error_description: string }[];
};
if (!installHttpRes.ok) {
  const msg = installJson.Error?.[0]?.error_description ?? `HTTP ${installHttpRes.status}`;
  throw new Error(`POST /installation failed: ${msg}`);
}
const installRes = installJson;
const installToken = extractField<string>(installRes.Response, 'Token', 'token');
console.log('   ✓ Installation created');

// ── Step 2: Device registration ───────────────────────────────────────────────

console.log('\n📡 Step 2: POST /device-server');
await bunqPost('/device-server', installToken, {
  description: APP_NAME,
  secret: apiKey,
  permitted_ips: ['*'],
});
console.log('   ✓ Device registered');

// ── Step 3: Session ───────────────────────────────────────────────────────────

console.log('\n📡 Step 3: POST /session-server');
const sessionRes = await bunqPost<{ Response: unknown[] }>('/session-server', installToken, {
  secret: apiKey,
});
const sessionToken = extractField<string>(sessionRes.Response, 'Token', 'token');

// Extract user ID from any user type in response
let userId: string | null = null;
for (const item of sessionRes.Response) {
  const rec = item as Record<string, Record<string, unknown>>;
  for (const key of ['UserPerson', 'UserCompany', 'UserLight', 'UserApiKey']) {
    if (rec[key]?.id !== undefined) {
      userId = String(rec[key].id);
      break;
    }
  }
  if (userId) break;
}
if (!userId) throw new Error('Could not extract user ID from session response');
console.log('   ✓ Session created');

// ── Step 4: Create or fetch existing OAuth client ────────────────────────────

console.log('\n📡 Step 4: POST /user/{id}/oauth-client (or fetch existing)');
let oauthClientId: number;
try {
  const createRes = await bunqPost<{ Response: unknown[] }>(
    `/user/${userId}/oauth-client`,
    sessionToken,
    { status: 'ACTIVE' },
  );
  oauthClientId = extractField<number>(createRes.Response, 'Id', 'id');
  console.log(`   ✓ OAuth client created`);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (!msg.includes('one active OAuth Client')) throw e;
  const listRes = await bunqGet<{ Response: unknown[] }>(
    `/user/${userId}/oauth-client`,
    sessionToken,
  );
  oauthClientId = extractField<number>(listRes.Response, 'OauthClient', 'id');
  console.log(`   ℹ️  OAuth client already existed, reusing it`);
}

// ── Step 5: Add redirect URI ──────────────────────────────────────────────────

console.log('\n📡 Step 5: POST /user/{id}/oauth-client/{id}/callback-url');
try {
  await bunqPost(`/user/${userId}/oauth-client/${oauthClientId}/callback-url`, sessionToken, {
    url: redirectUri,
  });
  console.log(`   ✓ Redirect URI registered: ${redirectUri}`);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (!msg.includes('already been registered')) throw e;
  console.log(`   ℹ️  Redirect URI already registered, skipping`);
}

// ── Step 6: Retrieve client_id + client_secret ────────────────────────────────

console.log('\n📡 Step 6: GET /user/{id}/oauth-client/{id}');
const getRes = await bunqGet<{ Response: unknown[] }>(
  `/user/${userId}/oauth-client/${oauthClientId}`,
  sessionToken,
);

let clientId: string | null = null;
let clientSecret: string | null = null;
for (const item of getRes.Response) {
  const rec = item as Record<string, unknown>;
  const inner = rec['OauthClient'] as Record<string, unknown> | undefined;
  if (inner) {
    clientId = String(inner.client_id ?? '');
    clientSecret = String(inner.secret ?? '');
    break;
  }
}
if (!clientId || !clientSecret) {
  throw new Error('Could not extract client_id / client_secret from response');
}

// ── Done ──────────────────────────────────────────────────────────────────────

const envContents = [
  `BUNQ_CLIENT_ID=${clientId}`,
  `BUNQ_CLIENT_SECRET=${clientSecret}`,
  `BUNQ_REDIRECT_URI=${redirectUri}`,
  'BUNQ_SANDBOX=false',
  '',
].join('\n');

await writeFile(OUTPUT_ENV_PATH, envContents, { mode: 0o600 });
await chmod(OUTPUT_ENV_PATH, 0o600);

console.log(`\n✅ Done! Wrote bunq OAuth env vars to ${OUTPUT_ENV_PATH}.`);
console.log('Copy them into packages/backend/.env when ready.');
