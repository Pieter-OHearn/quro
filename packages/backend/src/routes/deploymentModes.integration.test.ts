import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { parseTrustedProxies } from '../lib/clientAddress';
import { getClientAddress } from '../middleware/rateLimit';
import { peerEnv } from '../test/peer';
import { createIntegrationHelpers, integrationPassword } from '../test/integration';

// The two supported deployment modes from docs/security.md, as the backend sees them. The
// bundled nginx overwrites X-Real-IP with its peer, appends its peer to X-Forwarded-For and sets
// X-Forwarded-Proto to its own scheme, which is always http.
const NGINX = '172.18.0.3';
const LAN_CLIENT = '192.168.1.50';
// A reverse proxy on the Docker host reaches nginx's published port through the network gateway.
const DOCKER_GATEWAY = '172.18.0.1';
const COMPOSE_TRUSTED_PROXIES = '172.16.0.0/12';
const SPOOFED = '198.51.100.7';

type Mode = {
  name: string;
  secureCookies: 'false' | 'true';
  origin: string;
  forwarded: Record<string, string>;
};

const MODES: Mode[] = [
  {
    name: 'mode A: HTTP on a private network, browser -> nginx -> backend',
    secureCookies: 'false',
    origin: 'http://quro.local',
    forwarded: {
      'X-Real-IP': LAN_CLIENT,
      'X-Forwarded-For': `${SPOOFED}, ${LAN_CLIENT}`,
      'X-Forwarded-Proto': 'http',
    },
  },
  {
    name: 'mode B: HTTPS, browser -> TLS proxy -> nginx -> backend',
    secureCookies: 'true',
    origin: 'https://quro.example.test',
    forwarded: {
      'X-Real-IP': DOCKER_GATEWAY,
      'X-Forwarded-For': `${SPOOFED}, ${LAN_CLIENT}, ${DOCKER_GATEWAY}`,
      'X-Forwarded-Proto': 'http',
    },
  },
];

const integration = createIntegrationHelpers('deployment-modes.integration.quro.test');
const originalSecureCookies = process.env.SECURE_COOKIES;

function restoreSecureCookies() {
  if (originalSecureCookies === undefined) delete process.env.SECURE_COOKIES;
  else process.env.SECURE_COOKIES = originalSecureCookies;
}

type CookieAttributes = { value: string; flags: Set<string>; attributes: Map<string, string> };

function parseSetCookies(response: Response): Map<string, CookieAttributes> {
  const cookies = new Map<string, CookieAttributes>();
  for (const header of response.headers.getSetCookie()) {
    const [pair = '', ...rest] = header.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    const flags = new Set<string>();
    const attributes = new Map<string, string>();
    for (const part of rest) {
      const [key = '', value] = part.split('=');
      if (value === undefined) flags.add(key.toLowerCase());
      else attributes.set(key.toLowerCase(), value);
    }
    cookies.set(pair.slice(0, separator), { value: pair.slice(separator + 1), flags, attributes });
  }
  return cookies;
}

function signUpThroughProxy(mode: Mode, label: string, inviteCode: string) {
  return integration.request('/api/auth/signup', {
    method: 'POST',
    remoteAddress: NGINX,
    headers: { ...mode.forwarded, Origin: mode.origin },
    json: {
      firstName: 'Mode',
      lastName: label,
      email: integration.buildEmail(label),
      password: integrationPassword,
      age: 35,
      retirementAge: 67,
      inviteCode,
    },
  });
}

function clientKeyApp(trustedProxies: string) {
  const proxies = parseTrustedProxies(trustedProxies);
  const app = new Hono();
  app.get('/key', (c) => c.text(getClientAddress(c, proxies) ?? 'unknown'));
  return async (peer: string, headers: Record<string, string>) => {
    const response = await app.request('/key', { headers }, peerEnv(peer));
    return response.text();
  };
}

beforeAll(async () => {
  await integration.cleanup();
});

afterAll(async () => {
  restoreSecureCookies();
  await integration.cleanup();
});

describe.each(MODES)('$name', (mode) => {
  beforeAll(() => {
    process.env.SECURE_COOKIES = mode.secureCookies;
  });

  afterAll(restoreSecureCookies);

  test('sign-up sets HttpOnly SameSite=Lax session cookies, Secure exactly when configured', async () => {
    const response = await signUpThroughProxy(mode, 'cookies', await integration.issueInviteCode());
    expect(response.status).toBe(201);

    const cookies = parseSetCookies(response);
    const session = cookies.get('session')!;
    const csrf = cookies.get('csrf_token')!;
    expect(session.flags.has('httponly')).toBe(true);
    expect(csrf.flags.has('httponly')).toBe(false);
    for (const cookie of [session, csrf]) {
      expect(cookie.attributes.get('samesite')).toBe('Lax');
      expect(cookie.attributes.get('path')).toBe('/');
      expect(cookie.flags.has('secure')).toBe(mode.secureCookies === 'true');
      expect(Number(cookie.attributes.get('max-age'))).toBe(30 * 24 * 60 * 60);
    }
  });

  test('state changes need the CSRF header the frontend copies from its cookie', async () => {
    const owner = await integration.signUp('csrf');
    const sessionOnly = owner.cookie.split(';')[0]!;
    const base = { method: 'DELETE', remoteAddress: NGINX } as const;

    const withoutHeader = await integration.request('/api/settings/sessions', {
      ...base,
      headers: { ...mode.forwarded, Origin: mode.origin, Cookie: owner.cookie },
    });
    expect(withoutHeader.status).toBe(403);

    const withoutCookie = await integration.request('/api/settings/sessions', {
      ...base,
      headers: { ...mode.forwarded, Cookie: sessionOnly, 'X-CSRF-Token': owner.csrfToken },
    });
    expect(withoutCookie.status).toBe(403);

    const matching = await integration.request('/api/settings/sessions', {
      ...base,
      cookie: owner.cookie,
      headers: { ...mode.forwarded, Origin: mode.origin },
    });
    expect(matching.status).toBe(200);
  });

  test('another site gets no CORS grant for credentialed requests', async () => {
    const preflight = await integration.request('/api/settings/sessions', {
      method: 'OPTIONS',
      remoteAddress: NGINX,
      headers: {
        ...mode.forwarded,
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'DELETE',
        'Access-Control-Request-Headers': 'x-csrf-token',
      },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();

    const read = await integration.request('/api/auth/me', {
      remoteAddress: NGINX,
      headers: { ...mode.forwarded, Origin: 'https://attacker.example' },
    });
    expect(read.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('rate limits key on the browser address, not on a client-supplied hop', async () => {
    const keyFor = clientKeyApp(COMPOSE_TRUSTED_PROXIES);
    expect(await keyFor(NGINX, mode.forwarded)).toBe(LAN_CLIENT);
  });
});

describe('mode B with the TLS proxy on another host', () => {
  const REMOTE_PROXY = '192.168.1.10';
  const forwarded = {
    'X-Real-IP': REMOTE_PROXY,
    'X-Forwarded-For': `${SPOOFED}, ${LAN_CLIENT}, ${REMOTE_PROXY}`,
  };

  test('needs the proxy address in TRUSTED_PROXIES to see the browser address', async () => {
    expect(await clientKeyApp(COMPOSE_TRUSTED_PROXIES)(NGINX, forwarded)).toBe(REMOTE_PROXY);
    expect(await clientKeyApp(`${COMPOSE_TRUSTED_PROXIES},${REMOTE_PROXY}`)(NGINX, forwarded)).toBe(
      LAN_CLIENT,
    );
  });

  test('with TRUSTED_PROXIES unset every browser shares the nginx key', async () => {
    expect(await clientKeyApp('')(NGINX, forwarded)).toBe(NGINX);
  });
});

describe('direct access to the backend, bypassing nginx', () => {
  const forged = {
    'X-Real-IP': SPOOFED,
    'X-Forwarded-For': SPOOFED,
    'X-Forwarded-Proto': 'https',
    'X-Forwarded-User': 'admin',
    'X-Forwarded-Email': 'admin@example.test',
  };

  test('forwarded headers from an untrusted peer are ignored for rate limiting', async () => {
    expect(await clientKeyApp(COMPOSE_TRUSTED_PROXIES)(LAN_CLIENT, forged)).toBe(LAN_CLIENT);
  });

  test('authentication and CSRF are enforced by the backend itself', async () => {
    const anonymous = await integration.request('/api/goals', {
      remoteAddress: LAN_CLIENT,
      headers: forged,
    });
    expect(anonymous.status).toBe(401);

    const owner = await integration.signUp('direct-csrf');
    const noCsrf = await integration.request('/api/settings/sessions', {
      method: 'DELETE',
      remoteAddress: LAN_CLIENT,
      headers: { ...forged, Cookie: owner.cookie },
    });
    expect(noCsrf.status).toBe(403);
  });

  test('a forwarded https scheme does not change cookie flags', async () => {
    process.env.SECURE_COOKIES = 'false';
    try {
      const response = await integration.request('/api/auth/signin', {
        method: 'POST',
        remoteAddress: LAN_CLIENT,
        headers: forged,
        json: {
          email: (await integration.signUp('forwarded-proto')).user.email,
          password: integrationPassword,
        },
      });
      expect(response.status).toBe(200);
      expect(parseSetCookies(response).get('session')?.flags.has('secure')).toBe(false);
    } finally {
      restoreSecureCookies();
    }
  });
});
