import { afterEach, describe, expect, test } from 'bun:test';
import { ConfigError } from '../config';
import { applyTestSettings, writeTestSecret } from '../test/config';
import {
  getAdminDatabaseUrl,
  getBootstrapDatabaseUrl,
  getRuntimeDatabaseUrl,
  redactDatabaseUrl,
} from './config';

// The parsing rules are tested in src/config; these tests cover the accessors the database layer
// uses. Every database setting is set explicitly, so the environment of the machine running the
// tests cannot leak into the result.
const DATABASE_SETTINGS = [
  'ADMIN_DATABASE_URL',
  'APP_DATABASE_URL',
  'BOOTSTRAP_DATABASE_URL',
  'DATABASE_URL',
  'POSTGRES_ADMIN_PASSWORD_FILE',
  'POSTGRES_ADMIN_USER',
  'POSTGRES_APP_PASSWORD_FILE',
  'POSTGRES_APP_USER',
  'POSTGRES_DB',
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_SSLMODE',
];

const cleared = Object.fromEntries(DATABASE_SETTINGS.map((name) => [name, undefined]));
let restore = () => {};

function useSettings(settings: Record<string, string | undefined>) {
  restore = applyTestSettings({ ...cleared, ...settings });
}

afterEach(() => restore());

describe('database config', () => {
  test('prefers explicit runtime URLs over derived values', () => {
    useSettings({
      APP_DATABASE_URL: 'postgres://app:pw@db:5432/runtime',
      DATABASE_URL: 'postgres://shared:pw@db:5432/shared',
      POSTGRES_HOST: 'ignored-host',
    });

    expect(getRuntimeDatabaseUrl()).toBe('postgres://app:pw@db:5432/runtime');
  });

  test('uses DATABASE_URL as the shared fallback for both roles', () => {
    useSettings({ DATABASE_URL: 'postgres://shared:pw@db:5432/shared' });

    expect(getRuntimeDatabaseUrl()).toBe('postgres://shared:pw@db:5432/shared');
    expect(getAdminDatabaseUrl()).toBe('postgres://shared:pw@db:5432/shared');
  });

  test('builds the runtime URL from settings and a password file', () => {
    useSettings({
      POSTGRES_HOST: 'db',
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'quro',
      POSTGRES_APP_USER: 'quro_app',
      POSTGRES_APP_PASSWORD_FILE: writeTestSecret('app', 'app secret/with:chars'),
    });

    expect(getRuntimeDatabaseUrl()).toBe(
      'postgres://quro_app:app%20secret%2Fwith%3Achars@db:5432/quro',
    );
  });

  test('builds the admin URL from settings and a password file', () => {
    useSettings({
      POSTGRES_HOST: 'db',
      POSTGRES_DB: 'quro',
      POSTGRES_ADMIN_USER: 'quro_admin',
      POSTGRES_ADMIN_PASSWORD_FILE: writeTestSecret('admin', 'admin-secret'),
    });

    expect(getAdminDatabaseUrl()).toBe('postgres://quro_admin:admin-secret@db:5432/quro');
    expect(getBootstrapDatabaseUrl()).toBe(getAdminDatabaseUrl());
  });

  test('the bootstrap URL can name a more privileged connection', () => {
    useSettings({
      DATABASE_URL: 'postgres://shared:pw@db:5432/shared',
      BOOTSTRAP_DATABASE_URL: 'postgres://super:pw@db:5432/postgres',
    });

    expect(getBootstrapDatabaseUrl()).toBe('postgres://super:pw@db:5432/postgres');
  });

  test('names the missing settings instead of building a URL with an empty password', () => {
    useSettings({ POSTGRES_HOST: 'db', POSTGRES_APP_PASSWORD_FILE: '/nonexistent/app-password' });

    expect(() => getRuntimeDatabaseUrl()).toThrow(ConfigError);
    expect(() => getRuntimeDatabaseUrl()).toThrow(
      'POSTGRES_APP_PASSWORD_FILE: secret file not found at /nonexistent/app-password',
    );
  });

  test('has no default host', () => {
    useSettings({ POSTGRES_APP_PASSWORD_FILE: writeTestSecret('app', 'x') });

    expect(() => getRuntimeDatabaseUrl()).toThrow('POSTGRES_HOST');
  });
});

describe('redactDatabaseUrl', () => {
  test('hides the password and leaves the rest', () => {
    expect(redactDatabaseUrl('postgres://user:secret@db:5432/quro')).not.toContain('secret');
    expect(redactDatabaseUrl('postgres://user:secret@db:5432/quro')).toContain('user:***@db');
  });

  test('returns a value that is not a URL unchanged', () => {
    expect(redactDatabaseUrl('not a url')).toBe('not a url');
  });
});
