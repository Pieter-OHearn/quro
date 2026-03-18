import { readFileSync } from 'node:fs';

const DEFAULT_DATABASE_HOST = 'db';
const DEFAULT_DATABASE_NAME = 'quro';
const DEFAULT_DATABASE_PORT = '5432';
const DEFAULT_ADMIN_USER = 'quro_admin';
const DEFAULT_APP_USER = 'quro_app';
const DEFAULT_ADMIN_SECRET_FILE = '/run/secrets/postgres_admin_password';
const DEFAULT_APP_SECRET_FILE = '/run/secrets/postgres_app_password';

function getFirstNonEmptyValue(values: readonly string[]) {
  for (const value of values) {
    if (value !== '') {
      return value;
    }
  }

  return '';
}

function getEnvValue(name: string) {
  return process.env[name]?.trim() ?? '';
}

function readSecretFile(secretFilePath: string) {
  try {
    return readFileSync(secretFilePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function getDatabaseHost() {
  return getFirstNonEmptyValue([
    getEnvValue('POSTGRES_HOST'),
    getEnvValue('DATABASE_HOST'),
    DEFAULT_DATABASE_HOST,
  ]);
}

function getDatabasePort() {
  return getFirstNonEmptyValue([
    getEnvValue('POSTGRES_PORT'),
    getEnvValue('DATABASE_PORT'),
    DEFAULT_DATABASE_PORT,
  ]);
}

function getDatabaseName() {
  return getFirstNonEmptyValue([getEnvValue('POSTGRES_DB'), DEFAULT_DATABASE_NAME]);
}

function encodeConnectionPart(value: string) {
  return encodeURIComponent(value);
}

function buildDatabaseUrl({
  database,
  host,
  password,
  port,
  user,
}: {
  database: string;
  host: string;
  password: string;
  port: string;
  user: string;
}) {
  const encodedUser = encodeConnectionPart(user);
  const encodedPassword = encodeConnectionPart(password);
  const encodedDatabase = encodeConnectionPart(database);
  return `postgres://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDatabase}`;
}

function buildRuntimeDatabaseUrlFromEnv() {
  const user = getFirstNonEmptyValue([
    getEnvValue('POSTGRES_APP_USER'),
    getEnvValue('APP_DB_USER'),
    getEnvValue('POSTGRES_USER'),
    DEFAULT_APP_USER,
  ]);
  const password = getFirstNonEmptyValue([
    process.env.APP_DB_PASSWORD ?? '',
    process.env.POSTGRES_APP_PASSWORD ?? '',
    process.env.POSTGRES_PASSWORD ?? '',
    readSecretFile(
      getFirstNonEmptyValue([getEnvValue('POSTGRES_APP_PASSWORD_FILE'), DEFAULT_APP_SECRET_FILE]),
    ),
  ]);

  return buildDatabaseUrl({
    database: getDatabaseName(),
    host: getDatabaseHost(),
    password,
    port: getDatabasePort(),
    user,
  });
}

function buildAdminDatabaseUrlFromEnv() {
  const user = getFirstNonEmptyValue([
    getEnvValue('POSTGRES_ADMIN_USER'),
    getEnvValue('POSTGRES_USER'),
    DEFAULT_ADMIN_USER,
  ]);
  const password = getFirstNonEmptyValue([
    process.env.POSTGRES_ADMIN_PASSWORD ?? '',
    process.env.POSTGRES_PASSWORD ?? '',
    readSecretFile(
      getFirstNonEmptyValue([
        getEnvValue('POSTGRES_ADMIN_PASSWORD_FILE'),
        DEFAULT_ADMIN_SECRET_FILE,
      ]),
    ),
  ]);

  return buildDatabaseUrl({
    database: getDatabaseName(),
    host: getDatabaseHost(),
    password,
    port: getDatabasePort(),
    user,
  });
}

export function getRuntimeDatabaseUrl() {
  return (
    process.env.APP_DATABASE_URL || process.env.DATABASE_URL || buildRuntimeDatabaseUrlFromEnv()
  );
}

export function getAdminDatabaseUrl() {
  return (
    process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || buildAdminDatabaseUrlFromEnv()
  );
}

export function getBootstrapDatabaseUrl() {
  return process.env.BOOTSTRAP_DATABASE_URL || getAdminDatabaseUrl();
}

export function redactDatabaseUrl(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}
