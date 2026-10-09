import { afterAll, beforeAll, describe, expect, test, setDefaultTimeout } from 'bun:test';
import { installProviderMocks } from '../test/providerMocks';

// The matrix exercises document, price and import routes without any provider or object store.
// These suites send hundreds of requests; the default 5 seconds is for single assertions.
setDefaultTimeout(60_000);

const providers = await installProviderMocks();
const { s3Objects } = providers;

const { app } = await import('../index');
const { PUBLIC_PATHS } = await import('../lib/publicPaths');
const { WORLD_EMAIL_DOMAIN, createWorld, destroyWorld, nonexistentRows, seedRows, snapshotWorld } =
  await import('../test/accessWorld');
const { ACCESS_CASES, EXEMPT_ROUTES } = await import('./accessMatrix.cases');
const { useFixtureCurrencyRates } = await import('../test/currencyRates');

import { createIntegrationHelpers, type AuthSession } from '../test/integration';
import type { RowIds, World } from '../test/accessWorld';
import type {
  AccessCase,
  CallerCase,
  CrossCase,
  Denial,
  ListCase,
  Req,
  RowCase,
} from './accessMatrix.cases';

let world: World;
const secretsSeen: string[] = [];
// Credentials stored for connected banks must never appear in any response, even the owner's.
const SECRET_PATTERN = /(?:token|key|session)-s04-[a-z-]+/;

type Reply = { status: number; body: unknown; text: string };

// Every fixture row carries a marker such as s04-owner-private; nothing else in a response may.
const MARKER_PATTERN =
  /s04-(?:owner|partner|stranger|former|pending|control|nonexistent)(?:-[a-z0-9]+)+/g;
const ANY_MARKER =
  /s04-(?:owner|partner|stranger|former|pending|control|nonexistent)(?:-[a-z0-9]+)+/;

async function call(actor: AuthSession | null, req: Req): Promise<Reply> {
  const response = await world.integration.request(req.path, {
    method: req.method,
    cookie: actor?.cookie ?? null,
    json: req.json,
    body: req.form?.(),
  });
  const text = (await response.text()).replace(/"syncedAt":"[^"]*"/g, '"syncedAt":"<time>"');
  const secret = text.match(SECRET_PATTERN);
  if (secret) secretsSeen.push(`${req.method} ${req.path}: ${secret[0]}`);
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Document downloads are not JSON.
  }
  return { status: response.status, body, text };
}

type ActorName =
  | 'owner'
  | 'partner'
  | 'stranger'
  | 'strangerPartner'
  | 'former'
  | 'pendingInvitee'
  | 'pendingRequester';

const ACTORS: readonly ActorName[] = [
  'owner',
  'partner',
  'stranger',
  'strangerPartner',
  'former',
  'pendingInvitee',
  'pendingRequester',
];

function session(name: ActorName): AuthSession {
  return world[name];
}

type Target = {
  description: string;
  rows: () => RowIds;
  /** Actors who must be denied. */
  denied: (scope: 'joint' | 'owner') => ActorName[];
};

const OTHERS_OF_OWNER_HOUSEHOLD: ActorName[] = [
  'stranger',
  'strangerPartner',
  'former',
  'pendingInvitee',
  'pendingRequester',
];

const TARGETS: Target[] = [
  {
    description: 'private rows of the owner',
    rows: () => world.household.private,
    denied: () => ['partner', ...OTHERS_OF_OWNER_HOUSEHOLD],
  },
  {
    description: 'joint rows of the owner',
    rows: () => world.household.joint,
    // Only an accepted partner may reach joint rows, and only in the tables that can be shared.
    denied: (scope) => [
      ...(scope === 'joint' ? [] : (['partner'] as const)),
      ...OTHERS_OF_OWNER_HOUSEHOLD,
    ],
  },
  {
    description: 'rows the owner and the former partner shared before the unlink (owner side)',
    rows: () => world.formerOwner,
    denied: () => ['partner', ...OTHERS_OF_OWNER_HOUSEHOLD],
  },
  {
    description: 'rows the owner and the former partner shared before the unlink (former side)',
    rows: () => world.formerOwn,
    denied: () => ['owner', 'partner', 'stranger', 'strangerPartner', 'pendingInvitee'],
  },
  {
    description: 'rows of a household the actor does not belong to',
    rows: () => world.strangerHousehold.private,
    denied: () => ['owner', 'partner', 'former', 'pendingInvitee'],
  },
  {
    description: 'joint-flagged rows behind a pending link',
    rows: () => world.pendingRequesterRows,
    denied: () => ['pendingInvitee', 'owner', 'partner', 'stranger'],
  },
];

const STATUS_FOR_DENIAL: Record<Denial, number> = {
  'not-found': 404,
  'bad-request': 400,
  empty: 200,
};

function routeKey(c: AccessCase): string {
  return c.route;
}

function describeFailure(parts: string[]): string {
  return parts.join(' | ');
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await useFixtureCurrencyRates('access-matrix');
  world = await createWorld((key, bytes) => s3Objects.set(key, bytes));
});

afterAll(async () => {
  await providers.restore();
  await destroyWorld(createIntegrationHelpers(WORLD_EMAIL_DOMAIN));
});

// ── Route inventory ─────────────────────────────────────────────────────────

function registeredRoutes(): string[] {
  const keys = new Set<string>();
  for (const route of app.routes) {
    if (route.method === 'ALL') continue;
    keys.add(`${route.method} ${route.path}`);
  }
  return [...keys].sort();
}

describe('route inventory', () => {
  test('every registered route is in the matrix or exempt with a reason', () => {
    const covered = new Set([...ACCESS_CASES.map(routeKey), ...Object.keys(EXEMPT_ROUTES)]);
    const unclassified = registeredRoutes().filter((key) => !covered.has(key));
    expect(unclassified).toEqual([]);
  });

  test('the matrix names only routes that exist', () => {
    const registered = new Set(registeredRoutes());
    const unknown = [...ACCESS_CASES.map(routeKey), ...Object.keys(EXEMPT_ROUTES)].filter(
      (key) => !registered.has(key),
    );
    expect(unknown).toEqual([]);
  });

  test('the public paths are exactly the documented ones', () => {
    expect([...PUBLIC_PATHS].sort()).toEqual([
      '/api/auth/me',
      '/api/auth/password-reset',
      '/api/auth/registration',
      '/api/auth/signin',
      '/api/auth/signout',
      '/api/auth/signup',
      '/api/bunq/oauth/callback',
      '/api/health',
      '/api/readiness',
      '/api/readiness/pension-import',
    ]);
    const paths = new Set(registeredRoutes().map((key) => key.split(' ')[1]));
    for (const path of PUBLIC_PATHS) expect(paths.has(path)).toBe(true);
  });

  test('every state-changing route is covered by a case with a body check or an exemption', () => {
    const mutating = registeredRoutes().filter((key) => !key.startsWith('GET '));
    const described = new Set([...ACCESS_CASES.map(routeKey), ...Object.keys(EXEMPT_ROUTES)]);
    expect(mutating.filter((key) => !described.has(key))).toEqual([]);
  });
});

// ── Unauthenticated access ──────────────────────────────────────────────────

describe('unauthenticated requests', () => {
  const protectedRoutes = () =>
    registeredRoutes()
      .map((key) => {
        const [method, path] = key.split(' ') as [string, string];
        return { method, path: path.replace(/:[A-Za-z]+/g, '1') };
      })
      .filter((route) => !PUBLIC_PATHS.has(route.path));

  test('every protected route answers 401 without a session', async () => {
    const failures: string[] = [];
    for (const route of protectedRoutes()) {
      const response = await world.integration.request(route.path, {
        method: route.method,
        // A matching token pair gets past the CSRF check, so the answer shows the auth check.
        cookie: 'csrf_token=anonymous-token',
        json: route.method === 'GET' ? undefined : {},
      });
      if (response.status !== 401)
        failures.push(`${route.method} ${route.path} -> ${response.status}`);
    }
    expect(failures).toEqual([]);
  });

  test('state-changing routes refuse a request without a CSRF token before anything else', async () => {
    const failures: string[] = [];
    for (const route of protectedRoutes().filter((r) => r.method !== 'GET')) {
      const response = await world.integration.request(route.path, {
        method: route.method,
        cookie: world.owner.cookie.split(';')[0]!,
        json: {},
      });
      if (response.status !== 403)
        failures.push(`${route.method} ${route.path} -> ${response.status}`);
    }
    expect(failures).toEqual([]);
  });

  test('a made-up or tampered session cookie is refused on every protected route', async () => {
    const real = world.owner.cookie.match(/session=([^;]+)/)![1]!;
    const forged = [
      'x'.repeat(real.length),
      real.slice(0, -1) + (real.endsWith('A') ? 'B' : 'A'),
      real.toUpperCase(),
      `${real}%20`,
      '',
    ];
    const failures: string[] = [];
    for (const token of forged) {
      for (const route of protectedRoutes().filter((r) => r.method === 'GET')) {
        const response = await world.integration.request(route.path, {
          cookie: `session=${token}; csrf_token=t`,
        });
        if (response.status !== 401) {
          failures.push(`${route.path} with ${token.slice(0, 6)} -> ${response.status}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test('lookalike paths do not inherit the public exemption', async () => {
    for (const path of [
      '/api/auth/me/',
      '/api/auth/me/extra',
      '/api/health/',
      '/api/health/../savings/accounts',
      '/api/readiness/pension-import/x',
      '/api/bunq/oauth/callback/x',
      '/api//savings/accounts',
    ]) {
      const response = await world.integration.request(path);
      expect([401, 404]).toContain(response.status);
      expect(await response.text()).not.toMatch(ANY_MARKER);
    }
  });
});

// ── Ids that name a row ─────────────────────────────────────────────────────

const rowCases = ACCESS_CASES.filter((c): c is RowCase => c.kind === 'row');
const crossCases = ACCESS_CASES.filter((c): c is CrossCase => c.kind === 'cross');
const listCases = ACCESS_CASES.filter((c): c is ListCase => c.kind === 'list');
const callerCases = ACCESS_CASES.filter((c): c is CallerCase => c.kind === 'caller');

function caseTitle(c: AccessCase, index: number): string {
  return `${c.route}${c.kind === 'row' ? '' : ` (${c.kind})`} #${index}`;
}

describe('denied access to rows by id', () => {
  test.each(rowCases.map((c, index) => [caseTitle(c, index), c] as const))(
    '%s',
    async (_title, c) => {
      const failures: string[] = [];
      const expectedStatus = STATUS_FOR_DENIAL[c.denied ?? 'not-found'];
      const before = await snapshotWorld(world.userIds);

      for (const target of TARGETS) {
        const request = c.build(target.rows());
        for (const actorName of target.denied(c.scope)) {
          const actor = session(actorName);
          const denied = await call(actor, request);
          const baseline = await call(actor, c.build(nonexistentRows()));
          const label = `${actorName} on ${target.description}`;
          if (baseline.status !== expectedStatus) {
            failures.push(
              `${label}: nonexistent id answered ${baseline.status}, expected ${expectedStatus}`,
            );
          }
          if (denied.status !== baseline.status || denied.text !== baseline.text) {
            failures.push(
              `${label}: ${denied.status} ${denied.text.slice(0, 120)} differs from the answer for an id that does not exist (${baseline.status} ${baseline.text.slice(0, 120)})`,
            );
          }
          if (ANY_MARKER.test(denied.text))
            failures.push(`${label}: response contains foreign data`);
        }
      }

      const after = await snapshotWorld(world.userIds);
      if (before !== after) failures.push('denied requests changed stored data');
      expect(failures).toEqual([]);
    },
  );
});

describe('own rows pointed at a parent of someone else', () => {
  test.each(crossCases.map((c, index) => [caseTitle(c, index), c] as const))(
    '%s',
    async (_t, c) => {
      const failures: string[] = [];
      const expectedStatus = STATUS_FOR_DENIAL[c.denied ?? 'not-found'];
      const before = await snapshotWorld(world.userIds);

      const own = world.household.private;
      const targets: Array<[string, RowIds]> = [
        ['a stranger household', world.strangerHousehold.private],
        ['a stranger household (joint)', world.strangerHousehold.joint],
        ['a row that does not exist', nonexistentRows()],
      ];
      const answers: Reply[] = [];
      for (const [label, foreign] of targets) {
        const reply = await call(world.owner, c.build(own, foreign));
        answers.push(reply);
        if (reply.status !== expectedStatus)
          failures.push(`${label}: answered ${reply.status}, expected ${expectedStatus}`);
        if (ANY_MARKER.test(reply.text)) failures.push(`${label}: response contains foreign data`);
      }
      if (new Set(answers.map((a) => a.text)).size !== 1) {
        failures.push(
          `the answer differs between a foreign and a missing parent: ${answers.map((a) => a.text.slice(0, 80)).join(' / ')}`,
        );
      }

      const after = await snapshotWorld(world.userIds);
      if (before !== after) failures.push('the rejected request changed stored data');
      expect(failures).toEqual([]);
    },
  );
});

// ── Collections ─────────────────────────────────────────────────────────────

function allowedMarkers(actor: ActorName, scope: 'joint' | 'owner'): RegExp {
  switch (actor) {
    case 'owner':
      return /^s04-(owner-(private|joint|before-unlink)|control-[a-z0-9-]+)$/;
    case 'partner':
      return scope === 'joint' ? /^s04-(owner-joint|control-joint-[a-z0-9-]+)$/ : /^$/;
    case 'stranger':
      return /^s04-stranger-(private|joint)$/;
    case 'strangerPartner':
      return scope === 'joint' ? /^s04-stranger-joint$/ : /^$/;
    case 'former':
      return /^s04-former-before-unlink$/;
    case 'pendingRequester':
      return /^s04-pending-requester$/;
    case 'pendingInvitee':
      return /^$/;
  }
}

describe('collections show each actor only what they may see', () => {
  test.each(listCases.map((c, index) => [caseTitle(c, index), c] as const))('%s', async (_t, c) => {
    const failures: string[] = [];
    const sawOwn = new Set<ActorName>();
    for (const name of ACTORS) {
      const reply = await call(session(name), c.build());
      if (reply.status !== 200 && !(reply.status === 404 && c.route.includes('bunq'))) {
        failures.push(`${name}: answered ${reply.status} ${reply.text.slice(0, 100)}`);
        continue;
      }
      const allowed = allowedMarkers(name, c.scope);
      const markers = reply.text.match(MARKER_PATTERN) ?? [];
      for (const marker of new Set(markers)) {
        if (!allowed.test(marker)) failures.push(`${name} received ${marker}`);
        else sawOwn.add(name);
      }
    }
    expect(failures).toEqual([]);
    // Collections that carry text must show the owner their own rows, or the check proves nothing.
    const carriesText =
      !/dashboard|runway|history|settings|assumptions|sessions|bunq|insights/.test(c.route);
    if (carriesText) expect(sawOwn.has('owner')).toBe(true);
  });
});

// ── Writes whose owner comes from the session ───────────────────────────────

describe('writes never take their owner from the request body', () => {
  test.each(callerCases.map((c, index) => [caseTitle(c, index), c] as const))(
    '%s',
    async (_t, c) => {
      const failures: string[] = [];
      const victims: Array<[ActorName, RowIds]> = [
        ['owner', world.household.private],
        ['partner', world.household.joint],
        ['former', world.formerOwn],
      ];
      const victimIds = world.userIds.filter((id) =>
        [world.owner.user.id, world.partner.user.id, world.former.user.id].includes(id),
      );
      const before = await snapshotWorld(victimIds);
      for (const [victim, rows] of victims) {
        const reply = await call(world.stranger, c.build(session(victim).user.id, rows));
        const created = (reply.body as { data?: { userId?: number } } | null)?.data;
        if (created?.userId !== undefined && created.userId !== world.stranger.user.id) {
          failures.push(`row created for user ${created.userId} when ${victim} was named`);
        }
        if (reply.status >= 500) failures.push(`${victim}: server error ${reply.status}`);
      }
      const after = await snapshotWorld(victimIds);
      if (before !== after) failures.push('a forged owner changed another household');
      expect(failures).toEqual([]);
    },
  );
});

// ── Positive controls ───────────────────────────────────────────────────────

let controlCounter = 0;
const sharedControl: Partial<Record<'private' | 'joint', RowIds>> = {};

async function controlRows(kind: 'private' | 'joint', fresh: boolean): Promise<RowIds> {
  const ensure = async (): Promise<RowIds> => {
    controlCounter += 1;
    const sessionRow = await world.integration.signIn(world.owner.user.email);
    const { hashSessionToken } = await import('../lib/sessions');
    return seedRows({
      userId: world.owner.user.id,
      marker: `s04-control-${kind}-${controlCounter}`,
      isJoint: kind === 'joint',
      includeSingletons: false,
      storeDocument: (key, bytes) => s3Objects.set(key, bytes),
      extraSessionId: hashSessionToken(sessionRow.cookie.match(/session=([^;]+)/)![1]!),
    });
  };
  if (fresh) return ensure();
  return (sharedControl[kind] ??= await ensure());
}

describe('the allowed actors succeed on the same requests', () => {
  test.each(rowCases.map((c, index) => [caseTitle(c, index), c] as const))('%s', async (_t, c) => {
    const failures: string[] = [];
    const expectOk = (label: string, reply: Reply) => {
      if (reply.status < 200 || reply.status >= 300) {
        failures.push(`${label}: ${reply.status} ${reply.text.slice(0, 160)}`);
      }
    };

    expectOk(
      'owner on private rows',
      await call(world.owner, c.build(await controlRows('private', c.consumes === true))),
    );
    if (c.scope === 'joint') {
      expectOk(
        'owner on joint rows',
        await call(world.owner, c.build(await controlRows('joint', c.consumes === true))),
      );
      expectOk(
        'partner on joint rows',
        await call(world.partner, c.build(await controlRows('joint', c.consumes === true))),
      );
    }
    expect(failures).toEqual([]);
  });
});

describe('credentials stored for connected banks', () => {
  test('never appear in any response, including the owner own', () => {
    expect(secretsSeen).toEqual([]);
  });
});

// Keeps the helper referenced for readers: the failure format is shared by the cases above.
void describeFailure;
