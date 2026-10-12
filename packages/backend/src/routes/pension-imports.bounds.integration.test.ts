import { afterAll, beforeAll, describe, expect, setDefaultTimeout, spyOn, test } from 'bun:test';
import { and, eq, inArray } from 'drizzle-orm';
import { installProviderMocks } from '../test/providerMocks';
import { applyTestSettings } from '../test/config';

/**
 * The import worker against a stand-in parser on a local port: the real client, the real
 * worker tick and a migrated database. Covers the processing bounds: a parser that does not
 * answer in time, a parser whose queue is full, refusals, and imports changed while parsed.
 */

setDefaultTimeout(30_000);

const PARSER_TIMEOUT_MS = 600;

type Behaviour = 'ok' | 'hang' | 'busy' | 'refuse' | 'fail' | 'slow';
const parser = {
  // Behaviour by uploaded file name prefix; `busyOnce` turns the next answer into a 503.
  busyOnce: new Set<string>(),
  requests: [] as string[],
  aborted: [] as string[],
  slowRelease: null as null | (() => void),
  slowStarted: null as null | (() => void),
};

function behaviourOf(fileName: string): Behaviour {
  return (fileName.split('-')[0] as Behaviour) ?? 'ok';
}

const PARSED_ROWS = {
  statementPeriodStart: '2025-01-01',
  statementPeriodEnd: '2025-12-31',
  modelName: 'stand-in',
  modelVersion: '1',
  rows: [
    {
      type: 'annual_statement',
      amount: 830.25,
      taxAmount: 0,
      date: '2025-12-31',
      note: 'synthetic return',
      isEmployer: null,
      confidence: 0.9,
      confidenceLabel: 'high',
      evidence: [],
      isDerived: false,
    },
    {
      type: 'contribution',
      amount: 250,
      taxAmount: 0,
      date: '2025-03-31',
      note: 'synthetic contribution',
      isEmployer: false,
      confidence: 0.9,
      confidenceLabel: 'high',
      evidence: [],
      isDerived: false,
    },
  ],
};

// Text a parser might put in a failure; none of it may reach the import or the log.
const PARSER_DETAIL = 'SYNTHETIC-PARSER-DETAIL Traceback (most recent call last)';

const stub = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ status: 'ok' });
    const form = await request.formData();
    const file = form.get('file') as File;
    const name = file.name;
    parser.requests.push(name);
    request.signal.addEventListener('abort', () => parser.aborted.push(name));

    if (parser.busyOnce.delete(name)) {
      return Response.json(
        { detail: { code: 'busy', message: PARSER_DETAIL } },
        { status: 503, headers: { 'Retry-After': '5' } },
      );
    }
    switch (behaviourOf(name)) {
      case 'hang':
        // Never answers; the client's timeout has to end the request.
        return new Promise<Response>(() => {});
      case 'refuse':
        return Response.json(
          { detail: { code: 'encrypted', message: PARSER_DETAIL } },
          { status: 422 },
        );
      case 'fail':
        return new Response(PARSER_DETAIL, { status: 500 });
      case 'slow':
        parser.slowStarted?.();
        await new Promise<void>((resolve) => (parser.slowRelease = resolve));
        return Response.json(PARSED_ROWS);
      default:
        return Response.json(PARSED_ROWS);
    }
  },
});

const providers = await installProviderMocks();

const { createIntegrationHelpers } = await import('../test/integration');
// After the integration helpers, which apply their own settings when first imported.
const restoreSettings = applyTestSettings({
  PENSION_PARSER_URL: `http://127.0.0.1:${stub.port}`,
  PENSION_PARSER_TIMEOUT_MS: String(PARSER_TIMEOUT_MS),
});
const { db } = await import('../db/client');
const { pensionStatementImportRows, pensionStatementImports, pensionTransactions } =
  await import('../db/schema');
const { runPensionImportWorkerTick } = await import('./pension-imports');

import type { AuthSession } from '../test/integration';

const integration = createIntegrationHelpers('pension-import-bounds.integration.quro.test');
let owner: AuthSession;
let potId: number;

const logged: string[] = [];
const spies = (['error', 'warn', 'log'] as const).map((level) =>
  spyOn(console, level).mockImplementation((...args: unknown[]) => {
    logged.push(
      args
        .map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg)))
        .join(' '),
    );
    for (const arg of args) if (typeof arg === 'object') logged.push(JSON.stringify(arg));
  }),
);

beforeAll(async () => {
  await integration.cleanup();
  owner = await integration.signUp('owner');
  const response = await integration.request('/api/pensions/pots', {
    method: 'POST',
    cookie: owner.cookie,
    json: {
      name: 'Synthetic pot',
      provider: 'Synthetic Fund',
      type: 'Workplace Pension',
      balance: 0,
      currency: 'EUR',
      employeeMonthly: 0,
      employerMonthly: 0,
      investmentStrategy: 'Balanced',
      color: '#1d4ed8',
      emoji: 'P',
    },
  });
  expect(response.status).toBe(201);
  potId = ((await response.json()) as { data: { id: number } }).data.id;
});

afterAll(async () => {
  for (const spy of spies) spy.mockRestore();
  await stub.stop(true);
  await providers.restore();
  restoreSettings();
  await integration.cleanup();
});

async function upload(prefix: Behaviour): Promise<number> {
  const name = `${prefix}-${crypto.randomUUID()}.pdf`;
  const form = new FormData();
  form.set('potId', String(potId));
  form.set('file', new File([`%PDF-1.7\n%${name}\n`], name, { type: 'application/pdf' }));
  const response = await integration.request('/api/pensions/imports', {
    method: 'POST',
    cookie: owner.cookie,
    body: form,
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { id: number } }).data.id;
}

async function importRecord(id: number) {
  const [row] = await db
    .select()
    .from(pensionStatementImports)
    .where(eq(pensionStatementImports.id, id));
  return row!;
}

async function rowCount(id: number) {
  const rows = await db
    .select({ id: pensionStatementImportRows.id })
    .from(pensionStatementImportRows)
    .where(eq(pensionStatementImportRows.importId, id));
  return rows.length;
}

// The worker takes the oldest queued import first; tick until this one has been handled.
async function tickUntilHandled(id: number, maxTicks = 5) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    await runPensionImportWorkerTick();
    const { status } = await importRecord(id);
    if (status !== 'queued' && status !== 'processing') return status;
  }
  return (await importRecord(id)).status;
}

describe('statement import processing bounds', () => {
  test('a parser that does not answer in time fails the import and the next one proceeds', async () => {
    const stuck = await upload('hang');
    const next = await upload('ok');

    const started = performance.now();
    await runPensionImportWorkerTick();
    const elapsed = performance.now() - started;

    const failed = await importRecord(stuck);
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('Parsing the statement took longer than allowed');
    // The request is abandoned at the timeout, not later.
    expect(elapsed).toBeGreaterThanOrEqual(PARSER_TIMEOUT_MS - 50);
    expect(elapsed).toBeLessThan(PARSER_TIMEOUT_MS + 2_000);
    // The connection is closed, which is what makes the parser stop the extraction.
    const stuckName = parser.requests.find((name) => name.startsWith('hang-'))!;
    await Bun.sleep(50);
    expect(parser.aborted).toContain(stuckName);

    expect(await tickUntilHandled(next)).toBe('ready_for_review');
    expect(await rowCount(next)).toBe(2);
  });

  test('a busy parser leaves the import queued, and the retry stores one set of rows', async () => {
    const id = await upload('ok');
    const requestsBefore = parser.requests.length;
    const fileName = (await importRecord(id)).fileName;
    parser.busyOnce.add(fileName);

    await runPensionImportWorkerTick();
    const waiting = await importRecord(id);
    expect(waiting.status).toBe('queued');
    expect(waiting.errorMessage).toBeNull();
    expect(await rowCount(id)).toBe(0);

    expect(await tickUntilHandled(id)).toBe('ready_for_review');
    expect(parser.requests.length).toBeGreaterThanOrEqual(requestsBefore + 2);
    expect(await rowCount(id)).toBe(2);

    // The same import delivered once more (as after a worker restart) replaces its rows.
    await db
      .update(pensionStatementImports)
      .set({ status: 'queued' })
      .where(eq(pensionStatementImports.id, id));
    expect(await tickUntilHandled(id)).toBe('ready_for_review');
    expect(await rowCount(id)).toBe(2);

    const commit = () =>
      integration.request(`/api/pensions/imports/${id}/commit`, {
        method: 'POST',
        cookie: owner.cookie,
        json: {},
      });
    expect((await commit()).status).toBe(200);
    expect((await commit()).status).toBe(400);
    const committed = await db
      .select({ id: pensionTransactions.id })
      .from(pensionTransactions)
      .where(
        and(eq(pensionTransactions.userId, owner.user.id), eq(pensionTransactions.potId, potId)),
      );
    expect(committed).toHaveLength(2);
  });

  test('parser refusals are stored as fixed messages, never the parser text', async () => {
    const refused = await upload('refuse');
    const failed = await upload('fail');
    expect(await tickUntilHandled(refused)).toBe('failed');
    expect(await tickUntilHandled(failed)).toBe('failed');

    expect((await importRecord(refused)).errorMessage).toBe(
      'The PDF is password protected; upload a copy without a password',
    );
    expect((await importRecord(failed)).errorMessage).toBe(
      'The statement parser failed with status 500',
    );
    expect(logged.join('\n')).not.toContain('SYNTHETIC-PARSER-DETAIL');
  });

  test('an import cancelled while it is parsed stays cancelled without rows', async () => {
    const id = await upload('slow');
    const started = new Promise<void>((resolve) => (parser.slowStarted = resolve));
    const tick = runPensionImportWorkerTick();
    await started;

    const cancel = await integration.request(`/api/pensions/imports/${id}`, {
      method: 'DELETE',
      cookie: owner.cookie,
    });
    expect(cancel.status).toBe(200);
    parser.slowRelease?.();
    await tick;

    expect((await importRecord(id)).status).toBe('cancelled');
    expect(await rowCount(id)).toBe(0);
  });

  test('every import of this suite is accounted for', async () => {
    const rows = await db
      .select({ status: pensionStatementImports.status })
      .from(pensionStatementImports)
      .where(inArray(pensionStatementImports.userId, [owner.user.id]));
    expect(rows.every((row) => row.status !== 'processing')).toBe(true);
  });
});
