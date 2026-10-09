import { describe, expect, test } from 'bun:test';
import { LIST_PAGE_DEFAULT_LIMIT, LIST_PAGE_MAX_LIMIT } from '@quro/shared';
import { savingsTransactions } from '../db/schema';
import {
  encodeListCursor,
  ledgerOrder,
  ledgerPosition,
  parseListPageQuery,
  readListPage,
  type ListWindow,
} from './listPage';

function query(values: Record<string, string>) {
  return { query: (name: string) => values[name] };
}

const raw = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

describe('parseListPageQuery', () => {
  test('defaults the limit and starts without a cursor', () => {
    expect(parseListPageQuery(query({}), 'date')).toEqual({
      ok: true,
      value: { limit: LIST_PAGE_DEFAULT_LIMIT, cursor: null },
    });
  });

  test('caps a larger limit at the hard maximum', () => {
    const parsed = parseListPageQuery(query({ limit: '100000000000000000000' }), 'date');
    expect(parsed).toEqual({ ok: true, value: { limit: LIST_PAGE_MAX_LIMIT, cursor: null } });
  });

  test.each(['', '0', '-1', '1.5', 'abc', ' 10', '1e3'])('rejects limit %p', (limit) => {
    expect(parseListPageQuery(query({ limit }), 'date')).toEqual({
      ok: false,
      error: 'Invalid limit',
    });
  });

  test('round-trips the cursors it issues', () => {
    const dated = encodeListCursor({ key: '2025-03-01', tie: 42 });
    expect(parseListPageQuery(query({ cursor: dated }), 'date')).toEqual({
      ok: true,
      value: { limit: LIST_PAGE_DEFAULT_LIMIT, cursor: { key: '2025-03-01', tie: 42 } },
    });
    const ordered = encodeListCursor({ key: 0, tie: 7 });
    expect(parseListPageQuery(query({ cursor: ordered }), 'integer')).toEqual({
      ok: true,
      value: { limit: LIST_PAGE_DEFAULT_LIMIT, cursor: { key: 0, tie: 7 } },
    });
  });

  test.each([
    ['empty', ''],
    ['not base64url', 'abc$'],
    ['padded', `${raw('["2025-03-01",42]')}=`],
    ['too long', 'A'.repeat(200)],
    ['not JSON', raw('2025-03-01:42')],
    ['an object', raw('{"key":"2025-03-01","tie":42}')],
    ['three parts', raw('["2025-03-01",42,1]')],
    ['an impossible date', raw('["2025-02-30",42]')],
    ['a date with a time', raw('["2025-03-01T00:00:00Z",42]')],
    ['a zero tie', raw('["2025-03-01",0]')],
    ['a fractional tie', raw('["2025-03-01",4.5]')],
    ['a tie beyond int32', raw('["2025-03-01",2147483648]')],
    ['a string tie', raw('["2025-03-01","42"]')],
    ['spacing the server never writes', raw('[ "2025-03-01",42]')],
    ['an integer key on a dated list', raw('[3,42]')],
  ])('rejects a cursor that is %s', (_label, cursor) => {
    expect(parseListPageQuery(query({ cursor }), 'date')).toEqual({
      ok: false,
      error: 'Invalid cursor',
    });
  });

  test('rejects a dated cursor on an integer-ordered list', () => {
    const cursor = encodeListCursor({ key: '2025-03-01', tie: 42 });
    expect(parseListPageQuery(query({ cursor }), 'integer')).toEqual({
      ok: false,
      error: 'Invalid cursor',
    });
  });
});

describe('readListPage', () => {
  const rows = [
    { id: 4, date: '2025-01-01' },
    { id: 9, date: '2025-01-01' },
    { id: 2, date: '2025-01-02' },
  ];

  test('asks for one extra row and returns a cursor only when more rows exist', async () => {
    const windows: ListWindow[] = [];
    const load = (window: ListWindow) => {
      windows.push(window);
      return Promise.resolve(rows.slice(0, window.limit));
    };
    const first = await readListPage(
      { limit: 2, cursor: null },
      ledgerOrder(savingsTransactions),
      load,
      ledgerPosition,
    );
    expect(windows[0]?.limit).toBe(3);
    expect(windows[0]?.where).toBeUndefined();
    expect(windows[0]?.orderBy).toHaveLength(2);
    expect(first.data).toEqual(rows.slice(0, 2));
    expect(first.nextCursor).toBe(encodeListCursor({ key: '2025-01-01', tie: 9 }));

    const last = await readListPage(
      { limit: 3, cursor: { key: '2025-01-01', tie: 9 } },
      ledgerOrder(savingsTransactions),
      load,
      ledgerPosition,
    );
    expect(windows[1]?.where).toBeDefined();
    expect(last).toEqual({ data: rows, nextCursor: null });
  });

  test('refuses to page a row without a date and id', () => {
    expect(() => ledgerPosition({ id: 1 })).toThrow(TypeError);
    expect(() => ledgerPosition({ id: '1', date: '2025-01-01' })).toThrow(TypeError);
  });
});
