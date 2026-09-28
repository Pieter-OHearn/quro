import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
  type TextMapGetter,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import { HTTP_STATUS } from '../constants/http';

// OpenTelemetry tracing: HTTP server spans for every request and a client span
// for every Postgres query, exported over OTLP/HTTP. Off unless
// OTEL_EXPORTER_OTLP_ENDPOINT (or OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) is set.
// The exporter reads the standard OTEL_EXPORTER_OTLP_* variables; the service
// name defaults to `quro-backend` (OTEL_SERVICE_NAME overrides it).

const TRACER_NAME = 'quro-backend';
// routePath() index of the last matched route: the handler, not a middleware.
const HANDLER_ROUTE_INDEX = -1;
const MAX_QUERY_TEXT_LENGTH = 2048;

let provider: BasicTracerProvider | undefined;

export function tracingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.OTEL_SDK_DISABLED === 'true') {
    return false;
  }
  return Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
}

/**
 * Registers the global tracer provider, context manager, and W3C propagator.
 * Returns false (and does nothing) when tracing isn't configured. Tests pass
 * their own span processor instead of the OTLP exporter.
 */
export function startTracing(
  env: NodeJS.ProcessEnv = process.env,
  spanProcessor?: SpanProcessor,
): boolean {
  if (provider || (!spanProcessor && !tracingEnabled(env))) {
    return Boolean(provider);
  }
  provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME || TRACER_NAME,
    }),
    spanProcessors: [spanProcessor ?? new BatchSpanProcessor(new OTLPTraceExporter())],
  });
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  return true;
}

export async function stopTracing(): Promise<void> {
  if (!provider) {
    return;
  }
  await provider.shutdown();
  provider = undefined;
  trace.disable();
  context.disable();
  propagation.disable();
}

const headerGetter: TextMapGetter<Headers> = {
  get: (headers, key) => headers.get(key) ?? undefined,
  keys: (headers) => [...headers.keys()],
};

function markError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error);
  }
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : undefined,
  });
}

/**
 * A server span per request, continuing the caller's trace (Traefik sends
 * `traceparent`). Records the matched route and status; 5xx responses and
 * handler errors mark the span as failed. The query string isn't recorded.
 */
export const httpTracing: MiddlewareHandler = (c, next) => {
  const method = c.req.method;
  const parent = propagation.extract(context.active(), c.req.raw.headers, headerGetter);
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(
    method,
    {
      kind: SpanKind.SERVER,
      attributes: {
        'http.request.method': method,
        'url.path': c.req.path,
      },
    },
    parent,
    async (span) => {
      try {
        await next();
        const route = routePath(c, HANDLER_ROUTE_INDEX);
        if (route && !route.endsWith('*')) {
          span.setAttribute('http.route', route);
          span.updateName(`${method} ${route}`);
        }
        const status = c.res.status;
        span.setAttribute('http.response.status_code', status);
        if (c.error) {
          markError(span, c.error);
        } else if (status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
      } catch (error) {
        markError(span, error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
};

const OPERATION_PATTERN = /^\s*(\w+)/;
const TABLE_PATTERN = /\b(?:from|into|update|join)\s+"?([\w.]+)"?/i;

function querySpanName(text: string): { name: string; operation?: string; table?: string } {
  const operation = OPERATION_PATTERN.exec(text)?.[1]?.toUpperCase();
  const table = TABLE_PATTERN.exec(text)?.[1];
  const name = [operation, table].filter(Boolean).join(' ') || 'postgresql';
  return { name, operation, table };
}

type Thenable = {
  then: (onFulfilled?: unknown, onRejected?: unknown) => unknown;
};

/**
 * Wraps a pending postgres.js query so a client span covers its execution.
 * postgres.js runs a query when it's first awaited, so the span starts then.
 * The query text is parameterized; parameter values aren't recorded.
 */
function traceQuery<T>(pending: T, text: string): T {
  const query = pending as unknown as Thenable;
  if (!query || typeof query.then !== 'function') {
    return pending;
  }
  const originalThen = query.then;
  let traced = false;
  query.then = function (onFulfilled?: unknown, onRejected?: unknown) {
    if (traced) {
      return originalThen.call(this, onFulfilled, onRejected);
    }
    traced = true;
    const { name, operation, table } = querySpanName(text);
    const span = trace.getTracer(TRACER_NAME).startSpan(name, {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system.name': 'postgresql',
        'db.query.text': text.slice(0, MAX_QUERY_TEXT_LENGTH),
        ...(operation ? { 'db.operation.name': operation } : {}),
        ...(table ? { 'db.collection.name': table } : {}),
      },
    });
    return originalThen.call(
      this,
      (value: unknown) => {
        span.end();
        return typeof onFulfilled === 'function' ? onFulfilled(value) : value;
      },
      (error: unknown) => {
        markError(span, error);
        span.end();
        if (typeof onRejected === 'function') {
          return onRejected(error);
        }
        throw error;
      },
    );
  };
  return pending;
}

type TransactionCallback = (sql: unknown) => unknown;

function wrapCallbackArgs(args: unknown[]): unknown[] {
  return args.map((arg) =>
    typeof arg === 'function'
      ? (sql: unknown) => (arg as TransactionCallback)(instrumentPostgres(sql as object))
      : arg,
  );
}

/**
 * Returns a postgres.js client whose queries each produce a client span.
 * Drizzle sends every query through `unsafe`; `begin` and `savepoint` hand
 * their callback an instrumented transaction client too.
 */
export function instrumentPostgres<T extends object>(sql: T): T {
  return new Proxy(sql, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      if (property === 'unsafe') {
        return (text: string, ...rest: unknown[]) =>
          traceQuery(value.call(target, text, ...rest), text);
      }
      if (property === 'begin' || property === 'savepoint') {
        return (...args: unknown[]) => value.apply(target, wrapCallbackArgs(args));
      }
      return value.bind(target);
    },
  });
}
