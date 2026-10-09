import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { hashSessionToken } from '../lib/sessions';
import { createIntegrationHelpers, integrationPassword } from '../test/integration';

/**
 * Dynamic checks against a real backend process on a throwaway port and database, started with
 * the settings an installation uses (NODE_ENV is not "test", so rate limits are active). The
 * process serves only synthetic accounts from the test database; nothing else is contacted.
 */

const integration = createIntegrationHelpers('dynamic-deployment.integration.quro.test');
const BACKEND_DIR = resolve(import.meta.dir, '../..');
const STARTUP_TIMEOUT_MS = 20_000;
const ALLOWED_ORIGIN = 'http://localhost:5173';
const FOREIGN_ORIGIN = 'https://evil.example';

type Backend = { url: string; stop: () => Promise<void> };

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response('') });
  const { port } = probe;
  await probe.stop(true);
  return port!;
}

async function startBackend(extraEnv: Record<string, string> = {}): Promise<Backend> {
  const port = await freePort();
  const env: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    HOST: '127.0.0.1',
    QRO_DISABLE_SCHEDULERS: 'true',
    SECURE_COOKIES: 'false',
    QRO_REGISTRATION_MODE: 'invite',
    TRUSTED_PROXIES: '',
    CORS_ORIGIN: ALLOWED_ORIGIN,
    // No provider is ever called from these processes: anything that tries to leave the machine
    // is sent to a closed local port and fails at once.
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    ALL_PROXY: 'http://127.0.0.1:9',
    NO_PROXY: '127.0.0.1,localhost',
    BUNQ_CLIENT_ID: '',
    BUNQ_CLIENT_SECRET: '',
    ...extraEnv,
  };
  const child = Bun.spawn([process.execPath, 'src/index.ts'], {
    cwd: BACKEND_DIR,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  for (;;) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error('The backend did not start in time');
    }
    await Bun.sleep(100);
  }
  return {
    url,
    stop: async () => {
      child.kill();
      await child.exited;
    },
  };
}

type Session = { cookie: string; csrf: string; userId: number; email: string };

function cookiesFrom(response: Response): { session: string; csrf: string } | null {
  const cookies = response.headers.getSetCookie();
  const session = cookies.map((c) => c.match(/^session=([^;]*)/)?.[1]).find(Boolean);
  const csrf = cookies.map((c) => c.match(/^csrf_token=([^;]*)/)?.[1]).find(Boolean);
  return session && csrf ? { session, csrf } : null;
}

let nextClient = 1;

async function signUp(
  backend: Backend,
  label: string,
  headers: HeadersInit = {},
): Promise<Session> {
  const email = integration.buildEmail(label);
  nextClient += 1;
  const response = await fetch(`${backend.url}/api/auth/signup`, {
    method: 'POST',
    // A proxy-trusting backend needs a forwarded address; a direct one ignores it.
    headers: {
      'Content-Type': 'application/json',
      'X-Real-IP': `203.0.113.${nextClient}`,
      ...headers,
    },
    body: JSON.stringify({
      firstName: 'Dynamic',
      lastName: label,
      email,
      password: integrationPassword,
      age: 30,
      retirementAge: 67,
      inviteCode: await integration.issueInviteCode(),
    }),
  });
  expect(response.status).toBe(201);
  const cookies = cookiesFrom(response)!;
  const { data } = (await response.json()) as { data: { id: number } };
  return {
    cookie: `session=${cookies.session}; csrf_token=${cookies.csrf}`,
    csrf: cookies.csrf,
    userId: data.id,
    email,
  };
}

function signIn(
  backend: Backend,
  email: string,
  password: string,
  headers: HeadersInit = {},
): Promise<Response> {
  return fetch(`${backend.url}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email, password }),
  });
}

function authed(backend: Backend, session: Session, path: string, init: RequestInit = {}) {
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  headers.set('Cookie', session.cookie);
  if (method !== 'GET') headers.set('X-CSRF-Token', session.csrf);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${backend.url}${path}`, { ...init, headers, redirect: 'manual' });
}

let direct: Backend;
let behindProxy: Backend;

beforeAll(async () => {
  await integration.cleanup();
  // Browsers reach the backend through nginx in both supported modes. These two processes are
  // the backend alone: one that trusts no proxy, and one that trusts the loopback "proxy".
  direct = await startBackend();
  behindProxy = await startBackend({ TRUSTED_PROXIES: '127.0.0.1/32' });
});

afterAll(async () => {
  await Promise.all([direct?.stop(), behindProxy?.stop()]);
  await integration.cleanup();
});

describe('brute-force limits', () => {
  test('failed sign-ins are limited per client address, and spoofed headers do not reset it', async () => {
    const victim = await signUp(direct, 'brute-direct');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // A direct client cannot choose its address by sending forwarding headers.
      const response = await signIn(direct, victim.email, 'wrong-password', {
        'X-Forwarded-For': `198.51.100.${attempt + 1}`,
        'X-Real-IP': `198.51.100.${attempt + 1}`,
      });
      statuses.push(response.status);
      expect(await response.json()).toEqual({ error: 'Invalid email or password' });
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401]);

    const blocked = await signIn(direct, victim.email, integrationPassword, {
      'X-Forwarded-For': '203.0.113.200',
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.getSetCookie()).toEqual([]);
    expect(await blocked.json()).toEqual({ error: 'Too many requests, please try again later' });
  });

  test('guesses against one account stop even when they come from many addresses', async () => {
    const victim = await signUp(behindProxy, 'brute-email');
    const bystander = await signUp(behindProxy, 'brute-bystander');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await signIn(behindProxy, victim.email, 'wrong-password', {
        'X-Real-IP': `198.51.100.${attempt + 10}`,
      });
      expect(response.status).toBe(401);
    }
    // A sixth guess from a sixth address is refused, and so is the right password.
    for (const password of ['wrong-password', integrationPassword]) {
      const response = await signIn(behindProxy, victim.email, password, {
        'X-Real-IP': '198.51.100.99',
      });
      expect(response.status).toBe(429);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    // Another account from that address is not affected.
    const other = await signIn(behindProxy, bystander.email, integrationPassword, {
      'X-Real-IP': '198.51.100.99',
    });
    expect(other.status).toBe(200);
  });

  test('sign-up attempts are limited per client address', async () => {
    const fresh = await startBackend();
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(`${fresh.url}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${attempt}` },
          body: JSON.stringify({
            firstName: 'Probe',
            lastName: 'Probe',
            email: integration.buildEmail(`limited-${attempt}`),
            password: integrationPassword,
            age: 30,
            retirementAge: 67,
            inviteCode: 'AAAAA-BBBBB-CCCCC-DDDDD',
          }),
        });
        statuses.push(response.status);
      }
      expect(statuses).toEqual([403, 403, 403, 429]);
    } finally {
      await fresh.stop();
    }
  });

  test('guessing recovery codes is limited', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`${direct.url}/api/auth/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'AAAAA-BBBBB-CCCCC-DDDDD', nextPassword: 'another-pass-123' }),
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });
});

describe('CSRF and cross-origin requests', () => {
  let user: Session;

  beforeAll(async () => {
    user = await signUp(behindProxy, 'csrf', { 'X-Real-IP': '198.51.100.50' });
  });

  const profile = (headers: HeadersInit) =>
    fetch(`${behindProxy.url}/api/settings/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ baseCurrency: 'EUR' }),
    });

  test('a state change needs the token the page reads from its own cookie', async () => {
    const cookie = user.cookie;
    expect((await profile({ Cookie: cookie })).status).toBe(403);
    expect((await profile({ Cookie: cookie, 'X-CSRF-Token': 'guess' })).status).toBe(403);
    expect(
      (
        await profile({
          Cookie: `session=${user.cookie.match(/session=([^;]+)/)![1]}`,
          'X-CSRF-Token': user.csrf,
        })
      ).status,
    ).toBe(403);
    expect((await profile({ Cookie: cookie, 'X-CSRF-Token': user.csrf })).status).toBe(200);
  });

  test('a cross-site form post cannot sign anyone in or out of a session', async () => {
    for (const path of ['/api/auth/signin', '/api/auth/signup', '/api/auth/password-reset']) {
      const response = await fetch(`${behindProxy.url}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: FOREIGN_ORIGIN,
        },
        body: 'email=a%40example.com&password=x',
      });
      expect(response.status).toBe(415);
    }
  });

  test('other origins get no CORS permission, the app origin does', async () => {
    const foreignPreflight = await fetch(`${behindProxy.url}/api/settings/preferences`, {
      method: 'OPTIONS',
      headers: {
        Origin: FOREIGN_ORIGIN,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,x-csrf-token',
      },
    });
    expect(foreignPreflight.headers.get('access-control-allow-origin')).toBeNull();

    const foreignRead = await fetch(`${behindProxy.url}/api/settings`, {
      headers: { Origin: FOREIGN_ORIGIN, Cookie: user.cookie },
    });
    expect(foreignRead.headers.get('access-control-allow-origin')).toBeNull();

    const appRead = await fetch(`${behindProxy.url}/api/settings`, {
      headers: { Origin: ALLOWED_ORIGIN, Cookie: user.cookie },
    });
    expect(appRead.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(appRead.headers.get('access-control-allow-credentials')).toBe('true');
  });

  test('session cookies are HttpOnly and SameSite, and the token cookie is readable by the page', async () => {
    const response = await signIn(behindProxy, user.email, integrationPassword, {
      'X-Real-IP': '198.51.100.51',
    });
    const cookies = response.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => c.startsWith('session='))!;
    const csrfCookie = cookies.find((c) => c.startsWith('csrf_token='))!;
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(csrfCookie).not.toMatch(/HttpOnly/i);
    expect(csrfCookie).toMatch(/SameSite=Lax/i);
  });
});

describe('session expiry', () => {
  test('a session stops working the moment it expires, on a running server', async () => {
    const user = await signUp(behindProxy, 'expiry', { 'X-Real-IP': '198.51.100.60' });
    expect((await authed(behindProxy, user, '/api/settings')).status).toBe(200);

    const digest = hashSessionToken(user.cookie.match(/session=([^;]+)/)![1]!);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, digest));

    const response = await authed(behindProxy, user, '/api/settings');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Session expired' });
    const write = await authed(behindProxy, user, '/api/goals', {
      method: 'POST',
      body: JSON.stringify({ name: 'After expiry' }),
    });
    expect(write.status).toBe(401);
  });

  test('signing out ends the session for the next request', async () => {
    const user = await signUp(behindProxy, 'signout', { 'X-Real-IP': '198.51.100.61' });
    const out = await fetch(`${behindProxy.url}/api/auth/signout`, {
      method: 'POST',
      headers: { Cookie: user.cookie },
    });
    expect(out.status).toBe(200);
    expect((await authed(behindProxy, user, '/api/settings')).status).toBe(401);
  });
});

describe('stored markup and reflected input', () => {
  const PAYLOADS = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "');alert(1);//",
    '{{7*7}}',
  ];

  test('markup in saved text comes back as JSON data, never as a page', async () => {
    const user = await signUp(behindProxy, 'xss', { 'X-Real-IP': '198.51.100.70' });
    for (const payload of PAYLOADS) {
      const created = await authed(behindProxy, user, '/api/savings/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: payload,
          bank: payload,
          balance: 1,
          currency: 'EUR',
          interestRate: 1,
          accountType: 'Easy Access',
          color: '#2563eb',
          emoji: 'S',
        }),
      });
      expect(created.status).toBe(201);
    }
    const listed = await authed(behindProxy, user, '/api/savings/accounts');
    expect(listed.headers.get('content-type')).toMatch(/^application\/json/);
    const { data } = (await listed.json()) as { data: Array<{ name: string }> };
    expect(data.map((account) => account.name).sort()).toEqual([...PAYLOADS].sort());
  });

  test('errors and unknown paths do not echo what the caller sent', async () => {
    const user = await signUp(behindProxy, 'reflect', { 'X-Real-IP': '198.51.100.71' });
    const marker = 'zzreflectzz';
    const probes: Array<Promise<Response>> = [
      authed(behindProxy, user, `/api/savings/accounts/<script>${marker}</script>`),
      authed(behindProxy, user, `/api/${marker}<script>`),
      authed(behindProxy, user, `/api/savings/accounts?includeArchived=${marker}`),
      authed(behindProxy, user, '/api/goals', {
        method: 'POST',
        body: `{"name":"${marker}"`,
      }),
      authed(behindProxy, user, '/api/goals', {
        method: 'POST',
        body: JSON.stringify({ [marker]: 1 }),
      }),
      fetch(`${behindProxy.url}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${marker}<script>`, password: marker }),
      }),
    ];
    for (const response of await Promise.all(probes)) {
      const text = await response.text();
      expect(response.status).toBeLessThan(500);
      expect(response.headers.get('content-type') ?? '').not.toMatch(/text\/html/);
      // Field names the parser rejects may be named; the values sent are not repeated.
      expect(text).not.toContain(`<script>${marker}`);
      expect(text).not.toContain(`${marker}</script>`);
    }
  });
});

describe('error responses', () => {
  test('a request the server cannot handle answers with a fixed message and no internals', async () => {
    const user = await signUp(behindProxy, 'internals', { 'X-Real-IP': '198.51.100.80' });
    const broken = await authed(behindProxy, user, '/api/salary/payslips/1/document', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=missing' },
      body: 'not multipart at all',
    });
    const text = await broken.text();
    expect(broken.status).toBeGreaterThanOrEqual(400);
    expect(text).not.toMatch(
      /at \S+ \(|node_modules|\/Users\/|\/app\/|SELECT |FROM "|postgres|Error:/i,
    );
    expect(text.length).toBeLessThan(200);
  });

  test('sign-in does not reveal whether an address has an account', async () => {
    const user = await signUp(behindProxy, 'enumeration', { 'X-Real-IP': '198.51.100.81' });
    const wrongPassword = await signIn(behindProxy, user.email, 'wrong-password', {
      'X-Real-IP': '198.51.100.82',
    });
    const unknownAccount = await signIn(
      behindProxy,
      integration.buildEmail('does-not-exist'),
      'wrong-password',
      { 'X-Real-IP': '198.51.100.83' },
    );
    expect(wrongPassword.status).toBe(unknownAccount.status);
    expect(await wrongPassword.text()).toBe(await unknownAccount.text());
  });
});
