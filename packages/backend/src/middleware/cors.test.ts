import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createCorsMiddleware, DEFAULT_CORS_ORIGINS, resolveCorsOrigin } from './cors';

describe('resolveCorsOrigin', () => {
  test('defaults to the documented Docker and Vite localhost origins', () => {
    expect(resolveCorsOrigin(undefined)).toEqual([...DEFAULT_CORS_ORIGINS]);
    expect(resolveCorsOrigin('')).toEqual([...DEFAULT_CORS_ORIGINS]);
  });

  test('parses comma-separated origin overrides', () => {
    expect(resolveCorsOrigin(' http://localhost , http://preview.quro.test ')).toEqual([
      'http://localhost',
      'http://preview.quro.test',
    ]);
  });

  test('rejects wildcard overrides and falls back to defaults', () => {
    expect(resolveCorsOrigin('*')).toEqual([...DEFAULT_CORS_ORIGINS]);
  });
});

describe('createCorsMiddleware', () => {
  test('allows the Docker frontend origin through preflight requests', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware());
    app.get('/api/health', (c) => c.json({ status: 'ok' }));

    const response = await app.request('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  test('does not allow unlisted origins', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware('http://localhost,http://localhost:5173'));
    app.get('/api/health', (c) => c.json({ status: 'ok' }));

    const response = await app.request('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});
