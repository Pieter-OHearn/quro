import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { errorFields, log, redactFields } from './logger';
import { runWithRequestId } from './requestContext';

const CANARY = 'canary-4f9c1e7a';

let lines: { level: string; entry: Record<string, unknown>; raw: string }[] = [];
const original = { log: console.log, warn: console.warn, error: console.error };

beforeEach(() => {
  lines = [];
  const capture = (level: string) => (raw: string) =>
    lines.push({ level, entry: JSON.parse(raw) as Record<string, unknown>, raw });
  console.log = capture('info');
  console.warn = capture('warn');
  console.error = capture('error');
});

afterEach(() => {
  Object.assign(console, original);
});

describe('log', () => {
  test('writes one JSON line per event to the stream of its level', () => {
    log.info('a.b', { count: 2 });
    log.warn('a.c');
    log.error('a.d');
    expect(lines.map((l) => [l.level, l.entry.event])).toEqual([
      ['info', 'a.b'],
      ['warn', 'a.c'],
      ['error', 'a.d'],
    ]);
    expect(lines[0]!.entry.count).toBe(2);
    expect(typeof lines[0]!.entry.time).toBe('string');
    expect(lines[0]!.entry.requestId).toBeUndefined();
  });

  test('adds the id of the request being served', () => {
    runWithRequestId('req-12345678', () => log.info('x'));
    expect(lines[0]!.entry.requestId).toBe('req-12345678');
  });

  test('replaces credentials and personal data by field name, whatever the value', () => {
    log.info('x', {
      password: CANARY,
      accessToken: CANARY,
      Authorization: CANARY,
      sessionId: CANARY,
      email: `${CANARY}@example.com`,
      iban: CANARY,
      balance: 123456,
      body: { amount: CANARY },
      nested: { secretKey: CANARY, harmless: 'kept' },
    });
    expect(lines[0]!.raw).not.toContain(CANARY);
    expect(lines[0]!.raw).not.toContain('123456');
    expect((lines[0]!.entry.nested as Record<string, unknown>).harmless).toBe('kept');
  });

  test('never records an error message, stack or cause text', () => {
    const driver = Object.assign(new Error(`insert values ${CANARY}`), { code: '23505' });
    const wrapped = new Error(`Failed query: params ${CANARY}`, { cause: driver });
    log.error('request.failed', { error: wrapped, ...errorFields(wrapped) });
    expect(lines[0]!.raw).not.toContain(CANARY);
    expect(lines[0]!.entry.errorCode).toBe('23505');
    expect(lines[0]!.entry.errorName).toBe('Error');
  });

  test('bounds long strings, deep objects and long lists', () => {
    const out = redactFields({
      long: 'x'.repeat(5000),
      list: Array.from({ length: 100 }, (_, i) => i),
      deep: { a: { b: { c: { d: 'x' } } } },
    });
    expect((out.long as string).length).toBeLessThan(300);
    expect((out.list as unknown[]).length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(out.deep)).toContain('[truncated]');
  });
});

describe('errorFields', () => {
  test('keeps the class, an SQLSTATE or system code and an HTTP status only', () => {
    const error = Object.assign(new TypeError(CANARY), { code: 'ECONNREFUSED', status: 502 });
    expect(errorFields(error)).toEqual({
      errorName: 'TypeError',
      errorCode: 'ECONNREFUSED',
      errorStatus: 502,
    });
    expect(errorFields(CANARY)).toEqual({ errorName: 'string' });
    expect(errorFields(Object.assign(new Error('x'), { code: CANARY }))).toEqual({
      errorName: 'Error',
    });
  });
});
