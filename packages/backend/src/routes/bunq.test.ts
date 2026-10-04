import { describe, expect, test } from 'bun:test';
import { loadBunqConfig } from '../lib/bunqConfig';

const FULL_ENV = {
  BUNQ_CLIENT_ID: 'client-id-value',
  BUNQ_CLIENT_SECRET: 'client-secret-value',
  BUNQ_REDIRECT_URI: 'https://quro.example/api/bunq/oauth/callback',
  FRONTEND_ORIGIN: 'https://quro.example/',
};

describe('loadBunqConfig', () => {
  test('is disabled when nothing is configured', () => {
    expect(loadBunqConfig({})).toEqual({ enabled: false });
    expect(loadBunqConfig({ BUNQ_CLIENT_ID: '  ', BUNQ_SANDBOX: 'true' })).toEqual({
      enabled: false,
    });
  });

  test('FRONTEND_ORIGIN alone does not enable bunq', () => {
    expect(loadBunqConfig({ FRONTEND_ORIGIN: 'https://quro.example' })).toEqual({
      enabled: false,
    });
  });

  test('accepts a complete configuration and normalises the origin', () => {
    expect(loadBunqConfig({ ...FULL_ENV, BUNQ_SANDBOX: 'true' })).toEqual({
      enabled: true,
      clientId: 'client-id-value',
      clientSecret: 'client-secret-value',
      redirectUri: FULL_ENV.BUNQ_REDIRECT_URI,
      frontendOrigin: 'https://quro.example',
      sandbox: true,
    });
  });

  test.each(Object.keys(FULL_ENV))('rejects a partial configuration missing %s', (missing) => {
    const env: Record<string, string> = { ...FULL_ENV };
    delete env[missing];
    expect(() => loadBunqConfig(env)).toThrow(missing);
  });

  test('has no fallback for FRONTEND_ORIGIN', () => {
    const { FRONTEND_ORIGIN: _omitted, ...env } = FULL_ENV;
    expect(() => loadBunqConfig(env)).toThrow('FRONTEND_ORIGIN');
  });

  test('rejects invalid URLs without echoing any configured value', () => {
    const env = { ...FULL_ENV, BUNQ_REDIRECT_URI: 'not a url' };
    let message = '';
    try {
      loadBunqConfig(env);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('BUNQ_REDIRECT_URI');
    for (const value of Object.values(env)) expect(message).not.toContain(value);
  });

  test('errors for missing variables never contain secrets', () => {
    let message = '';
    try {
      loadBunqConfig({ BUNQ_CLIENT_SECRET: 'super-secret-value' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain('super-secret-value');
  });
});
