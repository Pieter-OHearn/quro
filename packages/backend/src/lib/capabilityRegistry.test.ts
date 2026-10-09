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
  QRO_DOCUMENT_STORAGE: 's3',
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
  test('a bare core install enables nothing optional and keeps documents on the filesystem', () => {
    const config = configFor({});
    expect([...enabledCapabilities(config)]).toEqual([]);
    for (const state of describeCapabilities(config)) {
      expect(state).toMatchObject({ enabled: false, reason: 'not_configured' });
    }
  });

  test('each capability follows its own settings', () => {
    expect([...enabledCapabilities(configFor(BUNQ))]).toEqual(['bunq']);
    expect([...enabledCapabilities(configFor(S3))]).toEqual(['s3Storage']);
  });

  test('the S3 storage capability reports the selected driver', () => {
    expect(evaluateCapability('s3Storage', configFor({}))).toMatchObject({
      enabled: false,
      message: 'Documents are stored in the documents directory.',
    });
    expect(evaluateCapability('s3Storage', configFor(S3))).toMatchObject({
      enabled: true,
      message: 'Documents are stored in an S3-compatible store.',
    });
  });

  test('statement import needs only a parser, with either document store', () => {
    expect(evaluateCapability('pensionImport', configFor({})).enabled).toBe(false);
    expect(evaluateCapability('pensionImport', configFor(PARSER)).enabled).toBe(true);
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
