import { describe, expect, test } from 'bun:test';
import { createApp } from './app';
import { loadConfig, type Environment } from './config';

const BASE: Environment = { DATABASE_URL: 'postgres://u:p@h/db' };
const FULL: Environment = {
  QRO_DOCUMENT_STORAGE: 's3',
  S3_ENDPOINT: 'http://s3:9000',
  S3_REGION: 'eu-west-1',
  S3_BUCKET: 'docs',
  S3_ACCESS_KEY_ID: 'key',
  PENSION_PARSER_URL: 'http://parser:8080',
  BUNQ_CLIENT_ID: 'id',
  BUNQ_CLIENT_SECRET: 'secret',
  BUNQ_REDIRECT_URI: 'https://quro.example/api/bunq/oauth/callback',
  FRONTEND_ORIGIN: 'https://quro.example',
};

function appFor(env: Environment) {
  const read = (path: string) => {
    if (path === '/run/secrets/s3_secret_access_key') return 'secret\n';
    throw Object.assign(new Error('not found'), { code: 'ENOENT' });
  };
  return createApp(loadConfig({ ...BASE, ...env }, read).config);
}

function hasRoutesUnder(app: ReturnType<typeof createApp>, prefix: string) {
  return app.routes.some((route) => route.path === prefix || route.path.startsWith(`${prefix}/`));
}

describe('createApp', () => {
  test('without optional services it mounts the core and none of their routes', async () => {
    const app = appFor({});

    expect(hasRoutesUnder(app, '/api/bunq')).toBe(false);
    expect(hasRoutesUnder(app, '/api/pensions/imports')).toBe(false);
    for (const core of ['/api/savings', '/api/pensions', '/api/auth', '/api/capabilities']) {
      expect(hasRoutesUnder(app, core)).toBe(true);
    }
    const health = await app.request('/api/health');
    expect(health.status).toBe(200);
  });

  test('each optional route appears only with its own configuration', () => {
    const bunqOnly = appFor({
      BUNQ_CLIENT_ID: FULL.BUNQ_CLIENT_ID,
      BUNQ_CLIENT_SECRET: FULL.BUNQ_CLIENT_SECRET,
      BUNQ_REDIRECT_URI: FULL.BUNQ_REDIRECT_URI,
      FRONTEND_ORIGIN: FULL.FRONTEND_ORIGIN,
    });
    expect(hasRoutesUnder(bunqOnly, '/api/bunq')).toBe(true);
    expect(hasRoutesUnder(bunqOnly, '/api/pensions/imports')).toBe(false);

    // Documents go to the filesystem store by default, so a parser is all statement import needs.
    const parserOnly = appFor({ PENSION_PARSER_URL: FULL.PENSION_PARSER_URL });
    expect(hasRoutesUnder(parserOnly, '/api/pensions/imports')).toBe(true);
    expect(hasRoutesUnder(parserOnly, '/api/bunq')).toBe(false);
  });

  test('everything configured mounts every optional route', () => {
    const app = appFor(FULL);
    expect(hasRoutesUnder(app, '/api/bunq')).toBe(true);
    expect(hasRoutesUnder(app, '/api/pensions/imports')).toBe(true);
  });

  test('a disabled integration answers like an unknown path, not with its own error', async () => {
    const response = await appFor({}).request('/api/bunq/oauth/callback');
    expect(response.status).toBe(404);
  });
});
