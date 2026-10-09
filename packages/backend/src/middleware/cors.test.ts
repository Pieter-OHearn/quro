import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { loadConfig } from '../config';
import { createCorsMiddleware, DEFAULT_CORS_ORIGINS, resolveCorsOrigin } from './cors';

function corsOriginsFor(value: string | undefined) {
  const { config } = loadConfig({ DATABASE_URL: 'postgres://u:p@h/db', CORS_ORIGIN: value });
  return config.web.corsOrigins;
}

describe('resolveCorsOrigin', () => {
  test('defaults to the documented Docker and Vite localhost origins', () => {
    expect(resolveCorsOrigin(corsOriginsFor(undefined))).toEqual([...DEFAULT_CORS_ORIGINS]);
    expect(resolveCorsOrigin(corsOriginsFor(''))).toEqual([...DEFAULT_CORS_ORIGINS]);
  });

  test('parses comma-separated origin overrides', () => {
    expect(
      resolveCorsOrigin(corsOriginsFor(' http://localhost:3000 , http://preview.quro.test ')),
    ).toEqual(['http://localhost:3000', 'http://preview.quro.test']);
  });

  test('rejects wildcard overrides and falls back to defaults', () => {
    expect(resolveCorsOrigin(corsOriginsFor('*'))).toEqual([...DEFAULT_CORS_ORIGINS]);
  });

  test('a single origin is passed through as a string', () => {
    expect(resolveCorsOrigin(['https://quro.example'])).toBe('https://quro.example');
  });
});

describe('createCorsMiddleware', () => {
  test('allows the Docker frontend origin through preflight requests', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware(corsOriginsFor('')));
    app.get('/api/health', (c) => c.json({ status: 'ok' }));

    const response = await app.request('http://localhost:3000/api/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  test('does not allow unlisted origins', async () => {
    const app = new Hono();
    app.use('*', createCorsMiddleware(['http://localhost:3000', 'http://localhost:5173']));
    app.get('/api/health', (c) => c.json({ status: 'ok' }));

    const response = await app.request('http://localhost:3000/api/health', {
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
