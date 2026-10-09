/**
 * Ledger list endpoints return one bounded page at a time. A client follows `nextCursor`
 * until it is `null` to read the complete, explicitly ordered result.
 */
export type ListPage<T> = {
  data: T[];
  /** Opaque position after the last row of `data`; `null` on the last page. */
  nextCursor: string | null;
};

/** Rows per page when a request names no `limit`. */
export const LIST_PAGE_DEFAULT_LIMIT = 100;

/** Hard cap: a larger `limit` is reduced to this many rows. */
export const LIST_PAGE_MAX_LIMIT = 1000;
