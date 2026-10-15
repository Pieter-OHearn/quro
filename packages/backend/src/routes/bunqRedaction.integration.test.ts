import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { eq, inArray, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { getConfig } from '../config';
import { db } from '../db/client';
import { bunqConnections } from '../db/schema';
import { secretPlace } from '../lib/integrationSecrets';
import { openSecret } from '../lib/secretEnvelope';
import { instrumentPostgres, startTracing, stopTracing } from '../lib/tracing';
import { bunqStateCookie, clearBunqTestEnv, setBunqTestEnv } from '../test/bunq';
import { applyTestSettings } from '../test/config';
import { createIntegrationHelpers } from '../test/integration';

// Integration secrets must not reach logs, traces, API responses or the stored row in plaintext.
// A full bunq link and sync runs against a mocked bunq whose tokens are synthetic markers, with
// tracing on and every console line captured; then every place is searched for the markers.

const integration = createIntegrationHelpers('bunq-redaction.integration.quro.test');
const exporter = new InMemorySpanExporter();
const originalFetch = globalThis.fetch;
const run = randomBytes(4).toString('hex');
const MARKERS = {
  accessToken: `synthetic-redaction-access-${run}`,
  installationToken: `synthetic-redaction-installation-${run}`,
  sessionToken: `synthetic-redaction-session-${run}`,
  clientSecret: `synthetic-redaction-client-secret-${run}`,
  code: `synthetic-redaction-code-${run}`,
};

const logged: string[] = [];
const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const;
const originalConsole = Object.fromEntries(consoleMethods.map((name) => [name, console[name]]));
const userIds: number[] = [];
const responses: string[] = [];
let restoreSettings: () => void;

/** bunq's API, answering each endpoint the way a real link and sync need, with synthetic tokens. */
function mockBank(options: { failTokenExchange?: boolean } = {}) {
  const calls: string[] = [];
  globalThis.fetch = ((input: unknown) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/token?')) {
      return Promise.resolve(
        options.failTokenExchange
          ? new Response('', { status: 500 })
          : Response.json({ access_token: MARKERS.accessToken }),
      );
    }
    if (url.endsWith('/installation')) {
      return Promise.resolve(
        Response.json({
          Response: [
            { Token: { token: MARKERS.installationToken } },
            { ServerPublicKey: { server_public_key: 'synthetic-server-public-key' } },
          ],
        }),
      );
    }
    if (url.endsWith('/device-server')) return Promise.resolve(Response.json({ Response: [] }));
    if (url.endsWith('/session-server')) {
      return Promise.resolve(
        Response.json({
          Response: [
            { Token: { id: 11, token: MARKERS.sessionToken } },
            { UserPerson: { id: 42 } },
          ],
        }),
      );
    }
    return Promise.resolve(Response.json({ Response: [] }));
  }) as typeof fetch;
  return calls;
}

async function linkAndSync(label: string, failTokenExchange = false) {
  const user = await integration.signUp(label);
  userIds.push(user.user.id);
  const calls = mockBank({ failTokenExchange });
  const start = await integration.request('/api/bunq/oauth/start', { cookie: user.cookie });
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  const callback = await integration.request(
    `/api/bunq/oauth/callback?state=${state}&code=${MARKERS.code}`,
    { cookie: bunqStateCookie(state) },
  );
  responses.push(callback.headers.get('location') ?? '');
  const sync = await integration.request('/api/bunq/sync', {
    method: 'POST',
    cookie: user.cookie,
    headers: { 'X-CSRF-Token': user.csrfToken },
  });
  responses.push(await sync.text());
  const connection = await integration.request('/api/bunq/connection', { cookie: user.cookie });
  responses.push(await connection.text());
  return { user, callback, sync, calls };
}

function expectNoMarker(text: string, where: string) {
  for (const [name, marker] of Object.entries(MARKERS)) {
    if (text.includes(marker)) throw new Error(`${name} appeared in ${where}`);
  }
  // A private key the server generated would show its PEM header.
  expect(text).not.toContain('PRIVATE KEY');
}

beforeAll(async () => {
  await integration.cleanup();
  setBunqTestEnv();
  restoreSettings = applyTestSettings({ BUNQ_CLIENT_SECRET: MARKERS.clientSecret });
  startTracing(getConfig().tracing, new SimpleSpanProcessor(exporter));
  for (const name of consoleMethods) {
    console[name] = (...args: unknown[]) => {
      logged.push(args.map((arg) => (typeof arg === 'string' ? arg : Bun.inspect(arg))).join(' '));
    };
  }
});

afterAll(async () => {
  for (const name of consoleMethods) console[name] = originalConsole[name]!;
  globalThis.fetch = originalFetch;
  await stopTracing();
  restoreSettings();
  clearBunqTestEnv();
  if (userIds.length > 0) {
    await db.delete(bunqConnections).where(inArray(bunqConnections.userId, userIds));
  }
  await integration.cleanup();
});

describe('bank-link secrets stay out of logs, traces, responses and the stored row', () => {
  test('a full link and sync', async () => {
    const { user, sync, calls } = await linkAndSync('full');
    expect(sync.status).toBe(200);
    // The markers really went through: bunq was called with them and the server can open them.
    expect(calls.some((url) => url.endsWith('/session-server'))).toBe(true);
    const [row] = await db
      .select()
      .from(bunqConnections)
      .where(eq(bunqConnections.userId, user.user.id));
    const keyring = { current: getConfig().secrets.key, previous: null };
    expect(
      openSecret(row!.accessToken, secretPlace('access_token', user.user.id), keyring).value,
    ).toBe(MARKERS.accessToken);
    expect(
      openSecret(row!.sessionToken!, secretPlace('session_token', user.user.id), keyring).value,
    ).toBe(MARKERS.sessionToken);
    expect(
      openSecret(row!.privateKey!, secretPlace('private_key', user.user.id), keyring).value,
    ).toContain('PRIVATE KEY');

    // Every column of the row as text, as a dump of the table holds it.
    const [stored] = await db.execute<{ text: string }>(
      sql`select t::text as text from bunq_connections t where user_id = ${user.user.id}`,
    );
    expectNoMarker(stored!.text, 'the stored row');
  });

  test('a failed token exchange logs the path, not the code or the client secret', async () => {
    const { callback } = await linkAndSync('failed-exchange', true);
    expect(callback.headers.get('location')).toContain('bunq=error');
    expect(logged.some((line) => line.includes('[bunq oauth callback error]'))).toBe(true);
    expect(logged.join('\n')).toContain('/token');
  });

  test('query spans record parameterised text, never the values', async () => {
    const traced = instrumentPostgres(
      postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => undefined }),
    );
    try {
      await traced.unsafe('select $1::text as value', [MARKERS.accessToken]);
    } finally {
      await traced.end({ timeout: 5 });
    }
  });

  test('nothing above put a marker into a log line, a span or a response', () => {
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);
    const spanText = JSON.stringify(
      spans.map((span) => ({
        name: span.name,
        attributes: span.attributes,
        events: span.events,
        status: span.status,
      })),
    );
    expect(spanText).toContain('select $1::text');
    expectNoMarker(spanText, 'a span');
    expect(logged.length).toBeGreaterThan(0);
    expectNoMarker(logged.join('\n'), 'a log line');
    expectNoMarker(responses.join('\n'), 'an API response');
  });
});
