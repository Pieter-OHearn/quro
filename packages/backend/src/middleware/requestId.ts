import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { runWithRequestId } from '../lib/requestContext';

export const REQUEST_ID_HEADER = 'X-Request-Id';
export const REQUEST_ID_KEY = 'requestId';

// A caller (the reverse proxy) may supply the identifier; anything that is not a short, plain token
// is replaced, so a header can never inject line breaks or markup into a log.
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function resolveRequestId(incoming: string | undefined | null): string {
  return incoming && ACCEPTED_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/** Gives each request an id, exposes it to the logger, and returns it in `X-Request-Id`. */
export const requestId: MiddlewareHandler = async (c, next) => {
  const id = resolveRequestId(c.req.header(REQUEST_ID_HEADER));
  c.set(REQUEST_ID_KEY, id);
  c.header(REQUEST_ID_HEADER, id);
  await runWithRequestId(id, next);
};
