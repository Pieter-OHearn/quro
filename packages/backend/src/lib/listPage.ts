import { asc, desc, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { LIST_PAGE_DEFAULT_LIMIT, LIST_PAGE_MAX_LIMIT, type ListPage } from '@quro/shared';
import { err, ok, parseDateString, type ParseResult } from './requestValidation';

const MAX_INT32 = 2_147_483_647;
const MAX_CURSOR_LENGTH = 128;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const LIMIT_PATTERN = /^\d+$/;
// A cursor is the JSON pair [key, tie].
const CURSOR_PARTS = 2;

/**
 * A stable keyset order: the leading `key` column, then a `tie` column that is unique within
 * one key, so every row has exactly one position and a cursor never skips or repeats a row.
 */
export type KeysetOrder = {
  key: PgColumn;
  keyType: 'date' | 'integer';
  tie: PgColumn;
  direction: 'asc' | 'desc';
};

export type ListCursor = { key: string | number; tie: number };
export type ListPageRequest = { limit: number; cursor: ListCursor | null };

/** The slice of the ordered result one request reads: a keyset bound, the order and `limit + 1`. */
export type ListWindow = { where: SQL | undefined; orderBy: SQL[]; limit: number };

type QuerySource = { query(name: string): string | undefined };

/** Ledger order: by date, then by id, so rows entered on one day keep their entry order. */
export function ledgerOrder(
  table: { date: PgColumn; id: PgColumn },
  direction: KeysetOrder['direction'] = 'asc',
): KeysetOrder {
  return { key: table.date, keyType: 'date', tie: table.id, direction };
}

export function encodeListCursor(cursor: Readonly<ListCursor>): string {
  return Buffer.from(JSON.stringify([cursor.key, cursor.tie]), 'utf8').toString('base64url');
}

function isInt32(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= MAX_INT32;
}

function parseCursorKey(value: unknown, keyType: KeysetOrder['keyType']): string | number | null {
  if (keyType === 'integer') return isInt32(value, 0) ? value : null;
  return typeof value === 'string' && parseDateString(value) === value ? value : null;
}

function decodeListCursor(raw: string, keyType: KeysetOrder['keyType']): ListCursor | null {
  if (raw.length > MAX_CURSOR_LENGTH || !CURSOR_PATTERN.test(raw)) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(decoded) || decoded.length !== CURSOR_PARTS) return null;
  const key = parseCursorKey(decoded[0], keyType);
  const tie: unknown = decoded[1];
  if (key === null || !isInt32(tie, 1)) return null;
  const cursor = { key, tie };
  // Only the exact encoding this server issues is accepted.
  return encodeListCursor(cursor) === raw ? cursor : null;
}

function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined) return LIST_PAGE_DEFAULT_LIMIT;
  if (!LIMIT_PATTERN.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  if (parsed < 1) return null;
  return Math.min(parsed, LIST_PAGE_MAX_LIMIT);
}

/** Reads `limit` (default and hard cap from `@quro/shared`) and `cursor` from a list request. */
export function parseListPageQuery(
  source: QuerySource,
  keyType: KeysetOrder['keyType'],
): ParseResult<ListPageRequest> {
  const limit = parseLimit(source.query('limit'));
  if (limit === null) return err('Invalid limit');
  const rawCursor = source.query('cursor');
  if (rawCursor === undefined) return ok({ limit, cursor: null });
  const cursor = decodeListCursor(rawCursor, keyType);
  return cursor ? ok({ limit, cursor }) : err('Invalid cursor');
}

function keysetBound(order: Readonly<KeysetOrder>, cursor: ListCursor | null): SQL | undefined {
  if (!cursor) return undefined;
  const keyType = sql.raw(order.keyType === 'date' ? 'date' : 'integer');
  const comparator = sql.raw(order.direction === 'asc' ? '>' : '<');
  // A row comparison keeps the bound usable by a (key, tie) or (owner, key) index.
  return sql`(${order.key}, ${order.tie}) ${comparator} (cast(${cursor.key} as ${keyType}), cast(${cursor.tie} as integer))`;
}

function keysetOrderBy(order: Readonly<KeysetOrder>): SQL[] {
  const direction = order.direction === 'asc' ? asc : desc;
  return [direction(order.key), direction(order.tie)];
}

/**
 * Loads one page: at most `request.limit` rows after the cursor, plus a cursor for the next
 * page when more rows exist. `load` must apply the window's bound, order and limit.
 */
export async function readListPage<Row>(
  request: Readonly<ListPageRequest>,
  order: Readonly<KeysetOrder>,
  load: (window: ListWindow) => Promise<Row[]>,
  positionOf: (row: Row) => ListCursor,
): Promise<ListPage<Row>> {
  const rows = await load({
    where: keysetBound(order, request.cursor),
    orderBy: keysetOrderBy(order),
    limit: request.limit + 1,
  });
  const hasMore = rows.length > request.limit;
  const data = hasMore ? rows.slice(0, request.limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    nextCursor: hasMore && last !== undefined ? encodeListCursor(positionOf(last)) : null,
  };
}

/** The position of a ledger row, checked at runtime because generic tables type rows loosely. */
export function ledgerPosition(row: Readonly<Record<string, unknown>>): ListCursor {
  const { date, id } = row;
  if (typeof date !== 'string' || typeof id !== 'number') {
    throw new TypeError('A ledger row needs a date and an id to be paged');
  }
  return { key: date, tie: id };
}
