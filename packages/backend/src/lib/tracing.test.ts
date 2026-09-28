import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Hono } from 'hono';
import {
  httpTracing,
  instrumentPostgres,
  startTracing,
  stopTracing,
  tracingEnabled,
} from './tracing';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  startTracing({}, new SimpleSpanProcessor(exporter));
});

afterAll(async () => {
  await stopTracing();
});

beforeEach(() => {
  exporter.reset();
});

function fakeQuery(result: unknown, error?: Error) {
  // A postgres.js query runs when awaited, like this thenable.
  return {
    then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      const settled = error ? Promise.reject(error) : Promise.resolve(result);
      return settled.then(onFulfilled, onRejected);
    },
  };
}

type FakeClient = {
  unsafe: (text: string) => ReturnType<typeof fakeQuery>;
  begin: (callback: (sql: FakeClient) => unknown) => Promise<unknown>;
  options: { parsers: Record<string, unknown> };
};

function fakeClient(error?: Error): FakeClient {
  const client: FakeClient = {
    unsafe: (text: string) => fakeQuery([{ text }], error),
    begin: (callback) => Promise.resolve().then(() => callback(client)),
    options: { parsers: {} },
  };
  return client;
}

describe('tracingEnabled', () => {
  test('is on only with an OTLP endpoint and not disabled', () => {
    expect(tracingEnabled({})).toBe(false);
    expect(tracingEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' })).toBe(true);
    expect(
      tracingEnabled({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://collector:4318/v1/traces' }),
    ).toBe(true);
    expect(
      tracingEnabled({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_SDK_DISABLED: 'true',
      }),
    ).toBe(false);
  });
});

describe('httpTracing', () => {
  test('continues the caller trace and records the route and status', async () => {
    const app = new Hono();
    app.use('*', httpTracing);
    app.get('/api/goals/:id', (c) => c.json({ id: c.req.param('id') }));

    const response = await app.request('/api/goals/7?secret=x', {
      headers: { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' },
    });

    expect(response.status).toBe(200);
    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('GET /api/goals/:id');
    expect(span.kind).toBe(SpanKind.SERVER);
    expect(span.spanContext().traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(span.parentSpanContext?.spanId).toBe('b7ad6b7169203331');
    expect(span.attributes['http.route']).toBe('/api/goals/:id');
    expect(span.attributes['http.response.status_code']).toBe(200);
    expect(span.attributes['url.path']).toBe('/api/goals/7');
    expect(JSON.stringify(span.attributes)).not.toContain('secret');
  });

  test('marks handler errors as failed spans', async () => {
    const app = new Hono();
    app.use('*', httpTracing);
    app.onError((_error, c) => c.json({ error: 'Internal server error' }, 500));
    app.get('/boom', () => {
      throw new Error('boom');
    });

    const response = await app.request('/boom');

    expect(response.status).toBe(500);
    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.map((event) => event.name)).toContain('exception');
  });
});

describe('instrumentPostgres', () => {
  test('creates a child client span per query, inside the request span', async () => {
    const sql = instrumentPostgres(fakeClient());
    const app = new Hono();
    app.use('*', httpTracing);
    app.get('/rows', async (c) => c.json(await sql.unsafe('select * from "goals" where id = $1')));

    await app.request('/rows');

    const spans = exporter.getFinishedSpans();
    const query = spans.find((span) => span.kind === SpanKind.CLIENT);
    const server = spans.find((span) => span.kind === SpanKind.SERVER);
    expect(query?.name).toBe('SELECT goals');
    expect(query?.attributes['db.system.name']).toBe('postgresql');
    expect(query?.attributes['db.query.text']).toBe('select * from "goals" where id = $1');
    expect(query?.parentSpanContext?.spanId).toBe(server?.spanContext().spanId);
  });

  test('traces queries inside transactions and marks failures', async () => {
    const sql = instrumentPostgres(fakeClient(new Error('deadlock')));

    await expect(sql.begin((tx) => tx.unsafe('update "debts" set amount = $1'))).rejects.toThrow(
      'deadlock',
    );

    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('UPDATE debts');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  test('passes other properties through unchanged', () => {
    const client = fakeClient();
    expect(instrumentPostgres(client).options).toBe(client.options);
  });
});
