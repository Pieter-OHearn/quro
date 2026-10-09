import { describe, expect, test } from 'bun:test';
import { loadConfig, type Environment } from '../config';
import {
  CAPABILITIES,
  describeCapabilities,
  enabledCapabilities,
  evaluateCapability,
} from './capabilityRegistry';

const BASE: Environment = { DATABASE_URL: 'postgres://u:p@h/db' };
const S3: Environment = {
  S3_ENDPOINT: 'http://s3:9000',
  S3_REGION: 'eu-west-1',
  S3_BUCKET: 'docs',
  S3_ACCESS_KEY_ID: 'key',
};
const BUNQ: Environment = {
  BUNQ_CLIENT_ID: 'id',
  BUNQ_CLIENT_SECRET: 'secret',
  BUNQ_REDIRECT_URI: 'https://quro.example/api/bunq/oauth/callback',
  FRONTEND_ORIGIN: 'https://quro.example',
};
const PARSER: Environment = { PENSION_PARSER_URL: 'http://parser:8080' };

function configFor(env: Environment) {
  const read = (path: string) => {
    if (path === '/run/secrets/s3_secret_access_key') return 'secret\n';
    throw Object.assign(new Error('not found'), { code: 'ENOENT' });
  };
  return loadConfig({ ...BASE, ...env }, read).config;
}

describe('capability registry', () => {
  test('a bare core install enables nothing optional', () => {
    const config = configFor({});
    expect([...enabledCapabilities(config)]).toEqual([]);
    for (const state of describeCapabilities(config)) {
      expect(state).toMatchObject({ enabled: false, reason: 'not_configured' });
    }
  });

  test('each capability follows its own settings', () => {
    expect([...enabledCapabilities(configFor(BUNQ))]).toEqual(['bunq']);
    expect([...enabledCapabilities(configFor(S3))]).toEqual(['documents']);
  });

  test('statement import needs a parser and document storage', () => {
    expect(evaluateCapability('pensionImport', configFor(PARSER)).enabled).toBe(false);
    expect(evaluateCapability('pensionImport', configFor(S3)).enabled).toBe(false);
    expect(evaluateCapability('pensionImport', configFor({ ...S3, ...PARSER })).enabled).toBe(true);
  });

  test('disabled capabilities explain why without naming any value', () => {
    const state = evaluateCapability('bunq', configFor({}));
    expect(state).toEqual({
      enabled: false,
      reason: 'not_configured',
      message: 'Bunq linking is unavailable because this Quro instance has not configured it.',
    });
  });

  test('every capability has a unique id', () => {
    const ids = CAPABILITIES.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
