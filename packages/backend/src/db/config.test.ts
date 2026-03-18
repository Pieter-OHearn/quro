import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAdminDatabaseUrl, getBootstrapDatabaseUrl, getRuntimeDatabaseUrl } from './config';

const ENV_KEYS = [
  'ADMIN_DATABASE_URL',
  'APP_DATABASE_URL',
  'APP_DB_PASSWORD',
  'APP_DB_USER',
  'BOOTSTRAP_DATABASE_URL',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_URL',
  'POSTGRES_ADMIN_PASSWORD',
  'POSTGRES_ADMIN_PASSWORD_FILE',
  'POSTGRES_ADMIN_USER',
  'POSTGRES_APP_PASSWORD',
  'POSTGRES_APP_PASSWORD_FILE',
  'POSTGRES_APP_USER',
  'POSTGRES_DB',
  'POSTGRES_HOST',
  'POSTGRES_PASSWORD',
  'POSTGRES_PORT',
  'POSTGRES_USER',
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

const tempDirectories = new Set<string>();

afterEach(() => {
  for (const key of ENV_KEYS) {
    const originalValue = originalEnv.get(key);
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }

  for (const directory of tempDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  tempDirectories.clear();
});

function createSecretFile(fileName: string, value: string) {
  const directory = mkdtempSync(join(tmpdir(), 'quro-db-config-'));
  tempDirectories.add(directory);
  const filePath = join(directory, fileName);
  writeFileSync(filePath, value);
  return filePath;
}

function clearExplicitDatabaseUrls() {
  delete process.env.ADMIN_DATABASE_URL;
  delete process.env.APP_DATABASE_URL;
  delete process.env.BOOTSTRAP_DATABASE_URL;
  delete process.env.DATABASE_URL;
}

describe('database config', () => {
  test('prefers explicit runtime URLs over derived values', () => {
    process.env.APP_DATABASE_URL = 'postgres://app:pw@db:5432/runtime';
    process.env.DATABASE_URL = 'postgres://shared:pw@db:5432/shared';
    process.env.POSTGRES_HOST = 'ignored-host';

    expect(getRuntimeDatabaseUrl()).toBe('postgres://app:pw@db:5432/runtime');
  });

  test('derives runtime URL from Docker env and secret files', () => {
    clearExplicitDatabaseUrls();
    process.env.POSTGRES_HOST = 'db';
    process.env.POSTGRES_PORT = '5432';
    process.env.POSTGRES_DB = 'quro';
    process.env.POSTGRES_APP_USER = 'quro_app';
    process.env.POSTGRES_APP_PASSWORD_FILE = createSecretFile(
      'postgres_app_password',
      'secret-value\n',
    );

    expect(getRuntimeDatabaseUrl()).toBe('postgres://quro_app:secret-value@db:5432/quro');
  });

  test('DATABASE_URL overrides host-derived config for admin URLs', () => {
    process.env.DATABASE_URL = 'postgres://shared:pw@db:5432/shared';
    process.env.POSTGRES_HOST = 'ignored-host';
    process.env.POSTGRES_ADMIN_PASSWORD_FILE = createSecretFile(
      'postgres_admin_password',
      'secret-value',
    );

    expect(getAdminDatabaseUrl()).toBe('postgres://shared:pw@db:5432/shared');
  });

  test('derives admin and bootstrap URLs from Docker env and secrets', () => {
    clearExplicitDatabaseUrls();
    process.env.POSTGRES_HOST = 'db';
    process.env.POSTGRES_DB = 'quro';
    process.env.POSTGRES_ADMIN_USER = 'quro_admin';
    process.env.POSTGRES_ADMIN_PASSWORD_FILE = createSecretFile(
      'postgres_admin_password',
      'admin-secret',
    );

    expect(getAdminDatabaseUrl()).toBe('postgres://quro_admin:admin-secret@db:5432/quro');
    expect(getBootstrapDatabaseUrl()).toBe('postgres://quro_admin:admin-secret@db:5432/quro');
  });

  test('uses Docker-safe defaults instead of localhost fallbacks', () => {
    delete process.env.APP_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_HOST;
    delete process.env.DATABASE_HOST;
    delete process.env.POSTGRES_DB;
    delete process.env.POSTGRES_APP_USER;
    delete process.env.POSTGRES_APP_PASSWORD_FILE;

    expect(getRuntimeDatabaseUrl()).toBe('postgres://quro_app:@db:5432/quro');
  });
});
