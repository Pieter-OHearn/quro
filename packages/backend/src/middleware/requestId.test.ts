import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { currentRequestId } from '../lib/requestContext';
import { requestId, REQUEST_ID_HEADER, resolveRequestId } from './requestId';

function appWithHandler() {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use('*', requestId);
  app.get('/id', (c) => c.json({ seen: currentRequestId(), set: c.get('requestId') }));
  return app;
}

describe('requestId', () => {
  test('generates an id, exposes it to the logger and returns it in the header', async () => {
    const response = await appWithHandler().request('/id');
    const body = (await response.json()) as { seen: string; set: string };
    expect(body.seen).toBe(body.set);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe(body.seen);
    expect(body.seen).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('keeps a plain id from the proxy and replaces anything else', async () => {
    const kept = await appWithHandler().request('/id', {
      headers: { [REQUEST_ID_HEADER]: 'proxy-abc12345' },
    });
    expect(kept.headers.get(REQUEST_ID_HEADER)).toBe('proxy-abc12345');
    for (const hostile of [
      'short',
      'a'.repeat(65),
      'has space in it',
      '<script>alert(1)</script>',
    ]) {
      expect(resolveRequestId(hostile)).not.toBe(hostile);
    }
  });
});
