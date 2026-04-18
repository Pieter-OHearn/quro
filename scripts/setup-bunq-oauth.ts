#!/usr/bin/env bun
/**
 * setup-bunq-oauth.ts
 *
 * Registers a production bunq OAuth client via the API and prints the
 * BUNQ_CLIENT_ID / BUNQ_CLIENT_SECRET / BUNQ_REDIRECT_URI env vars.
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

import { createSign, generateKeyPairSync } from 'node:crypto';
import { randomUUID } from 'node:crypto';

const API_BASE = 'https://api.bunq.com/v1';
const APP_NAME = 'Quro';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function sign(body: string): string {
  const signer = createSign('SHA256');
  signer.update(body);
  return signer.sign(privateKey, 'base64');
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

function baseHeaders(authToken: string, body: string): Record<string, string> {
  return {
    ...commonHeaders(),
    'X-Bunq-Client-Authentication': authToken,
    'X-Bunq-Client-Signature': sign(body),
  };
}

async function bunqPost<T>(path: string, authToken: string, payload: unknown): Promise<T> {
  const body = JSON.stringify(payload);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: baseHeaders(authToken, body),
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
    headers: baseHeaders(authToken, ''),
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
console.log(`   ✓ Installation token: ${installToken.slice(0, 12)}…`);

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
console.log(`   ✓ Session token: ${sessionToken.slice(0, 12)}…`);
console.log(`   ✓ User ID: ${userId}`);

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
  console.log(`   ✓ OAuth client created, id: ${oauthClientId}`);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (!msg.includes('one active OAuth Client')) throw e;
  const listRes = await bunqGet<{ Response: unknown[] }>(
    `/user/${userId}/oauth-client`,
    sessionToken,
  );
  oauthClientId = extractField<number>(listRes.Response, 'OauthClient', 'id');
  console.log(`   ℹ️  OAuth client already existed, reusing id: ${oauthClientId}`);
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

console.log('\n✅ Done! Add these to packages/backend/.env:\n');
console.log(`BUNQ_CLIENT_ID=${clientId}`);
console.log(`BUNQ_CLIENT_SECRET=${clientSecret}`);
console.log(`BUNQ_REDIRECT_URI=${redirectUri}`);
console.log('BUNQ_SANDBOX=false');
