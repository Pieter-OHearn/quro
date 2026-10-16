import { currentRequestId } from './requestContext';

// Structured logs: one JSON object per line on stdout (info, debug) or stderr (warn, error), with a
// stable `event` name and the id of the request being served. Logs never carry a request or
// response body, a statement, a parameter value, a token, a key or an error message: an error is
// reduced to its class and codes (`errorFields`), because the message of a failed database
// statement repeats the SQL and the values it carried. A field whose name looks like a credential
// or personal data is replaced, whatever its value.

export type LogLevel = 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const REDACTED = '[redacted]';
const MAX_STRING_LENGTH = 200;
const MAX_DEPTH = 3;
const MAX_ENTRIES = 20;
const SENSITIVE_NAME =
  /pass(word|phrase)?|secret|token|authorization|cookie|credential|api[-_]?key|private|session|email|iban|account|balance|amount|body|payload|statement|sql|query|param|value/i;

function redactScalar(value: unknown): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }
  if (value instanceof Error) return errorFields(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return undefined;
}

function redactValue(value: unknown, depth: number): unknown {
  const scalar = redactScalar(value);
  if (scalar !== undefined || typeof value !== 'object') return scalar;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value))
    return value.slice(0, MAX_ENTRIES).map((v) => redactValue(v, depth + 1));
  return redactFields(value as LogFields, depth + 1);
}

export function redactFields(fields: LogFields, depth = 0): LogFields {
  const out: LogFields = {};
  for (const [name, value] of Object.entries(fields).slice(0, MAX_ENTRIES)) {
    out[name] = SENSITIVE_NAME.test(name) ? REDACTED : redactValue(value, depth);
  }
  return out;
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The part of an error that is safe to record: its class, a database SQLSTATE or system error code
 * and an HTTP status. Never its message, stack or cause text.
 */
export function errorFields(error: unknown): LogFields {
  if (!(error instanceof Error)) return { errorName: typeof error };
  const fields: LogFields = { errorName: error.name };
  const seen = new Set<unknown>();
  for (let current: unknown = error; current && !seen.has(current);) {
    seen.add(current);
    const { code, status } = current as { code?: unknown; status?: unknown };
    if (typeof code === 'string' && (SQLSTATE.test(code) || /^E[A-Z0-9_]{2,30}$/.test(code))) {
      fields.errorCode ??= code;
    }
    if (typeof status === 'number') fields.errorStatus ??= status;
    current = (current as { cause?: unknown }).cause;
  }
  return fields;
}

type Sink = (line: string) => void;
const sinks: Record<LogLevel, Sink> = {
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  const requestId = currentRequestId();
  const entry = {
    time: new Date().toISOString(),
    level,
    event,
    ...(requestId ? { requestId } : {}),
    ...redactFields(fields),
  };
  sinks[level](JSON.stringify(entry));
}

export const log = {
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, fields?: LogFields) => write('error', event, fields),
};
