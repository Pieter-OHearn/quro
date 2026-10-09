import { afterAll, beforeAll, describe, expect, test, setDefaultTimeout } from 'bun:test';
import { installProviderMocks } from '../test/providerMocks';

// These suites send hundreds of requests; the default 5 seconds is for single assertions.
setDefaultTimeout(60_000);

const providers = await installProviderMocks();

const { createIntegrationHelpers } = await import('../test/integration');
const { WORLD_EMAIL_DOMAIN, purgeSyntheticUsers, seedRows } = await import('../test/accessWorld');
const { useFixtureCurrencyRates } = await import('../test/currencyRates');
const { ACCESS_CASES } = await import('./accessMatrix.cases');

import type { AuthSession } from '../test/integration';
import type { RowIds } from '../test/accessWorld';
import type { Req } from './accessMatrix.cases';

/**
 * Every route that takes a JSON body is sent values of the wrong type, size and shape. The
 * answer must be a client error with a short message: never a server error, a stack trace, SQL
 * or a path. Rows are the owner's own, so nothing here depends on access rules.
 */

const DOMAIN = 'malformed-requests.integration.quro.test';
const integration = createIntegrationHelpers(DOMAIN);

let owner: AuthSession;
let rows: RowIds;

beforeAll(async () => {
  await purgeSyntheticUsers(integration, DOMAIN);
  await useFixtureCurrencyRates('malformed-requests');
  owner = await integration.signUp('owner');
  rows = await seedRows({
    userId: owner.user.id,
    marker: 's04-owner-private',
    isJoint: false,
    includeSingletons: true,
    storeDocument: (key, bytes) => providers.storedDocuments.set(key, bytes),
    extraSessionId: 'a'.repeat(64),
  });
});

afterAll(async () => {
  await providers.restore();
  await purgeSyntheticUsers(integration, DOMAIN);
  // The profile case renames the caller to an address in the matrix domain.
  await purgeSyntheticUsers(createIntegrationHelpers(WORLD_EMAIL_DOMAIN), WORLD_EMAIL_DOMAIN);
});

const JSON_METHODS = new Set(['POST', 'PATCH', 'PUT']);

type JsonRequest = { route: string; req: Req & { json: Record<string, unknown> } };

function jsonRequests(): JsonRequest[] {
  const found: JsonRequest[] = [];
  for (const c of ACCESS_CASES) {
    if (c.kind === 'list') continue;
    if (c.kind === 'caller') {
      const req = c.build(owner.user.id, rows);
      if (req.json && typeof req.json === 'object')
        found.push({ route: c.route, req: req as never });
      continue;
    }
    const req = c.kind === 'row' ? c.build(rows) : c.build(rows, rows);
    if (JSON_METHODS.has(req.method) && req.json && typeof req.json === 'object') {
      found.push({ route: `${c.route} (${c.kind})`, req: req as never });
    }
  }
  return found;
}

const BAD_VALUES: unknown[] = [
  null,
  '',
  '   ',
  'x'.repeat(5000),
  -1,
  0,
  1e21,
  Number.MAX_SAFE_INTEGER + 2,
  true,
  [],
  {},
  '<script>alert(1)</script>',
  "'; DROP TABLE users; --",
  '\u0000',
  '2026-02-30',
  { $gt: '' },
];

const BAD_BODIES: Array<[string, string]> = [
  ['an array', '[]'],
  ['null', 'null'],
  ['a string', '"text"'],
  ['a number', '42'],
  ['a prototype key', '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"x":1}}}'],
  ['deep nesting', `${'['.repeat(2000)}${']'.repeat(2000)}`],
  ['a truncated object', '{"name":'],
  ['text with a byte-order mark', '﻿{"name":"x"}'],
];

function describeProblem(
  route: string,
  field: string,
  status: number,
  text: string,
): string | null {
  if (status >= 500) return `${route} ${field}: server error ${status} ${text.slice(0, 80)}`;
  // A saved value is echoed back on success; only refusals must be short and plain.
  if (status < 400) return null;
  if (
    /at \S+ \(|node_modules|\/Users\/|Failed query|\bSELECT |\bINSERT INTO\b|\bUPDATE "|postgres/.test(
      text,
    )
  ) {
    return `${route} ${field}: internals in the answer: ${text.slice(0, 120)}`;
  }
  if (text.length > 400) return `${route} ${field}: answer is ${text.length} characters`;
  return null;
}

async function sendBadValues(route: string, req: JsonRequest['req'], field: string) {
  const problems: string[] = [];
  for (const value of BAD_VALUES) {
    const response = await integration.request(req.path, {
      method: req.method,
      cookie: owner.cookie,
      json: { ...req.json, [field]: value },
    });
    const problem = describeProblem(route, field, response.status, await response.text());
    if (problem) problems.push(problem);
  }
  return problems;
}

describe('values of the wrong kind', () => {
  test('never cause a server error or reveal internals', async () => {
    const problems: string[] = [];
    // The sweep is only meaningful while it reaches most of the JSON routes.
    expect(jsonRequests().length).toBeGreaterThanOrEqual(40);
    for (const { route, req } of jsonRequests()) {
      for (const field of Object.keys(req.json)) {
        problems.push(...(await sendBadValues(route, req, field)));
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('bodies of the wrong shape', () => {
  test('are refused with a client error on every route that reads JSON', async () => {
    const problems: string[] = [];
    for (const { route, req } of jsonRequests()) {
      for (const [label, body] of BAD_BODIES) {
        const response = await integration.request(req.path, {
          method: req.method,
          cookie: owner.cookie,
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const text = await response.text();
        const problem = describeProblem(route, label, response.status, text);
        if (problem) problems.push(problem);
        // A body whose only meaningful keys are unknown to the route is ignored, not stored.
        const ignoredIfUnknown = label === 'a prototype key';
        if (response.status < 400 && response.status !== 404 && !ignoredIfUnknown) {
          problems.push(`${route} ${label}: accepted with ${response.status}`);
        }
      }
    }
    expect(problems).toEqual([]);
    // Keys like __proto__ must never reach the shared prototype.
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  test('a body in another content type is not read as JSON', async () => {
    const problems: string[] = [];
    for (const { route, req } of jsonRequests().slice(0, 12)) {
      const response = await integration.request(req.path, {
        method: req.method,
        cookie: owner.cookie,
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(req.json),
      });
      const text = await response.text();
      const problem = describeProblem(route, 'text/plain', response.status, text);
      if (problem) problems.push(problem);
    }
    expect(problems).toEqual([]);
  });
});

describe('ids in the path and the query', () => {
  const BAD_IDS = [
    'abc',
    '0',
    '-1',
    '1.5',
    '2147483648',
    '1e3',
    '%00',
    '1%20OR%201=1',
    '9'.repeat(40),
  ];

  test('anything that is not a positive 32-bit integer is a 400, never a 500', async () => {
    const problems: string[] = [];
    const idPaths = ACCESS_CASES.flatMap((c) => {
      if (c.kind !== 'row') return [];
      const req = c.build(rows);
      return req.path.includes(String(rows.savingsAccount)) || /\/\d+(\/|$|\?)/.test(req.path)
        ? [{ route: c.route, req }]
        : [];
    });
    for (const { route, req } of idPaths) {
      for (const bad of BAD_IDS) {
        // Replace every numeric path segment and query value with the bad id.
        const path = req.path.replace(/\/\d+(?=\/|$|\?)/g, `/${bad}`).replace(/=\d+/g, `=${bad}`);
        const response = await integration.request(path, {
          method: req.method,
          cookie: owner.cookie,
          json: req.json,
        });
        const text = await response.text();
        const problem = describeProblem(route, `id ${bad}`, response.status, text);
        if (problem) problems.push(problem);
        if (![400, 404].includes(response.status)) {
          problems.push(`${route} id ${bad}: answered ${response.status}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
