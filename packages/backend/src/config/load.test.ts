import { describe, expect, test } from 'bun:test';
import { inspect } from 'node:util';
import { ConfigError, loadConfig, type Environment, type SectionName } from './load';

const CANARY = 'canary-secret-value-7f3a';

// A fake filesystem for secret files: a missing key behaves like ENOENT.
function files(contents: Record<string, string>) {
  return (path: string) => {
    if (!(path in contents)) {
      throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    }
    return contents[path];
  };
}

const SECRETS = {
  '/run/secrets/postgres_admin_password': `${CANARY}-admin\n`,
  '/run/secrets/postgres_app_password': `${CANARY}-app\n`,
};

const DATABASE_ENV = { POSTGRES_HOST: 'db.internal' } satisfies Environment;

function load(env: Environment, secrets: Record<string, string> = SECRETS) {
  return loadConfig(env, files(secrets));
}

function problemsOf(
  env: Environment,
  section: SectionName,
  secrets: Record<string, string> = SECRETS,
) {
  return load(env, secrets).problems[section];
}

describe('loadConfig defaults', () => {
  test('an environment with the database settings alone gives a working core', () => {
    const { config } = load(DATABASE_ENV);
    expect(config.runtime).toEqual({
      environment: 'development',
      port: 3000,
      host: '0.0.0.0',
      schedulersDisabled: false,
      sessionCleanupIntervalMs: 86_400_000,
    });
    expect(config.web.secureCookies).toBe(false);
    expect(config.web.registrationMode).toBe('invite');
    expect(config.web.trustedProxies).toBeNull();
    expect(config.web.frontendOrigin).toBeNull();
    expect(config.web.corsOrigins).toEqual(['http://localhost:3000', 'http://localhost:5173']);
    expect(config.documents).toEqual({ enabled: false });
    expect(config.bunq).toEqual({ enabled: false });
    expect(config.pensionImport).toEqual({
      parserUrl: null,
      parserTimeoutMs: 300_000,
      draftTtlDays: 7,
      workerPollIntervalMs: 3000,
    });
    expect(config.tracing).toEqual({
      enabled: false,
      tracesUrl: null,
      serviceName: 'quro-backend',
    });
  });

  test('the configuration is frozen', () => {
    const { config } = load(DATABASE_ENV);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.runtime)).toBe(true);
    expect(Object.isFrozen(config.web.corsOrigins)).toBe(true);
    expect(() => {
      (config.runtime as { port: number }).port = 1;
    }).toThrow();
  });
});

describe('database settings', () => {
  test('are built from the POSTGRES settings and the secret files', () => {
    const { config } = load({ ...DATABASE_ENV, POSTGRES_PORT: '6543', POSTGRES_DB: 'books' });
    expect(config.runtimeDatabase).toMatchObject({
      source: 'settings',
      user: 'quro_app',
      host: 'db.internal',
      port: 6543,
      database: 'books',
    });
    expect(config.runtimeDatabase.url.reveal()).toBe(
      `postgres://quro_app:${CANARY}-app@db.internal:6543/books`,
    );
    expect(config.adminDatabase.url.reveal()).toBe(
      `postgres://quro_admin:${CANARY}-admin@db.internal:6543/books`,
    );
    expect(config.adminDatabase.bootstrapUrl.reveal()).toBe(config.adminDatabase.url.reveal());
  });

  test('encode awkward passwords, including one that starts with a dash', () => {
    const { config } = load(DATABASE_ENV, {
      ...SECRETS,
      '/run/secrets/postgres_app_password': '-p@ss/w:rd#1\n',
    });
    expect(config.runtimeDatabase.url.reveal()).toBe(
      'postgres://quro_app:-p%40ss%2Fw%3Ard%231@db.internal:5432/quro',
    );
  });

  test('add sslmode and bracket an IPv6 host', () => {
    const { config } = load({
      POSTGRES_HOST: '2001:db8::1',
      POSTGRES_SSLMODE: 'verify-full',
    });
    expect(config.runtimeDatabase.url.reveal()).toContain(
      '@[2001:db8::1]:5432/quro?sslmode=verify-full',
    );
  });

  test('use custom secret file locations', () => {
    const { config } = load(
      { ...DATABASE_ENV, POSTGRES_APP_PASSWORD_FILE: '/secrets/app' },
      { ...SECRETS, '/secrets/app': 'custom\n' },
    );
    expect(config.runtimeDatabase.password.reveal()).toBe('custom');
  });

  test('prefer an explicit URL, role URLs over DATABASE_URL, and ignore the parts then', () => {
    const { config } = load({
      ...DATABASE_ENV,
      DATABASE_URL: 'postgres://shared:pw@shared-host:5432/shared',
      APP_DATABASE_URL: 'postgres://app:pw@app-host:5433/runtime',
    });
    expect(config.runtimeDatabase).toMatchObject({
      source: 'url',
      user: 'app',
      host: 'app-host',
      port: 5433,
      database: 'runtime',
    });
    expect(config.adminDatabase).toMatchObject({
      source: 'url',
      user: 'shared',
      host: 'shared-host',
    });
  });

  test('need no secret files when a URL is given', () => {
    const { config, problems } = loadConfig({ DATABASE_URL: 'postgres://u:p@h/db' }, files({}));
    expect(problems.runtimeDatabase).toEqual([]);
    expect(problems.adminDatabase).toEqual([]);
    expect(config.runtimeDatabase.database).toBe('db');
  });

  test('bootstrap URL overrides the owner connection', () => {
    const { config } = load({
      ...DATABASE_ENV,
      BOOTSTRAP_DATABASE_URL: 'postgres://super:pw@db.internal/postgres',
    });
    expect(config.adminDatabase.bootstrapUrl.reveal()).toBe(
      'postgres://super:pw@db.internal/postgres',
    );
  });

  test('a missing host is an error: there is no service-name default', () => {
    expect(problemsOf({}, 'runtimeDatabase').map((p) => p.setting)).toEqual(['POSTGRES_HOST']);
  });

  test('a missing or empty secret file names the path, not the content', () => {
    const missing = problemsOf(DATABASE_ENV, 'runtimeDatabase', {});
    expect(missing).toEqual([
      {
        setting: 'POSTGRES_APP_PASSWORD_FILE',
        message: 'secret file not found at /run/secrets/postgres_app_password',
      },
    ]);
    const empty = problemsOf(DATABASE_ENV, 'adminDatabase', {
      ...SECRETS,
      '/run/secrets/postgres_admin_password': '\n',
    });
    expect(empty[0].message).toBe('secret file is empty at /run/secrets/postgres_admin_password');
  });

  test('a section the process does not use can be broken without affecting the others', () => {
    const { config } = load(DATABASE_ENV, {
      '/run/secrets/postgres_app_password': 'app',
    });
    expect(config.runtimeDatabase.user).toBe('quro_app');
    expect(() => config.adminDatabase).toThrow(ConfigError);
  });

  test('reject an unknown sslmode and a URL that is not postgres', () => {
    expect(problemsOf({ ...DATABASE_ENV, POSTGRES_SSLMODE: 'maybe' }, 'runtimeDatabase')).toEqual([
      expect.objectContaining({ setting: 'POSTGRES_SSLMODE' }),
    ]);
    expect(problemsOf({ DATABASE_URL: 'https://example.com/db' }, 'runtimeDatabase')).toEqual([
      { setting: 'DATABASE_URL', message: 'must be a postgres:// URL' },
    ]);
  });
});

describe('retired settings', () => {
  const RETIRED_ENV = {
    DATABASE_HOST: 'legacy-host',
    DATABASE_PORT: '1',
    APP_DB_USER: 'legacy',
    APP_DB_PASSWORD: CANARY,
    POSTGRES_USER: 'legacy',
    POSTGRES_PASSWORD: CANARY,
    POSTGRES_ADMIN_PASSWORD: CANARY,
    POSTGRES_APP_PASSWORD: CANARY,
  };

  test('are never used as a fallback', () => {
    const { problems, config } = load(RETIRED_ENV);
    expect(problems.runtimeDatabase.map((p) => p.setting)).toEqual(['POSTGRES_HOST']);
    expect(config.notices.map((n) => n.setting).sort()).toEqual(Object.keys(RETIRED_ENV).sort());
  });

  test('the environment password is not read, the secret file is', () => {
    const { config } = load({ ...DATABASE_ENV, ...RETIRED_ENV });
    expect(config.runtimeDatabase.user).toBe('quro_app');
    expect(config.runtimeDatabase.password.reveal()).toBe(`${CANARY}-app`);
    expect(config.runtimeDatabase.host).toBe('db.internal');
  });

  test('are reported with their replacement and never with their value', () => {
    const { config } = load(RETIRED_ENV);
    const notice = config.notices.find((n) => n.setting === 'DATABASE_HOST');
    expect(notice?.message).toBe('is no longer read; use POSTGRES_HOST');
    expect(JSON.stringify(config.notices)).not.toContain(CANARY);
  });

  test('S3 with MINIO_APP_USER and the old secret variable says what replaces them', () => {
    const { problems } = load({
      ...DATABASE_ENV,
      S3_ENDPOINT: 'http://s3:9000',
      S3_REGION: 'eu-west-1',
      S3_BUCKET: 'docs',
      MINIO_APP_USER: 'legacy',
      S3_SECRET_ACCESS_KEY: CANARY,
    });
    expect(problems.documents).toEqual([
      {
        setting: 'S3_SECRET_ACCESS_KEY_FILE',
        message:
          'secret file not found at /run/secrets/s3_secret_access_key (S3_SECRET_ACCESS_KEY is no longer read)',
      },
      {
        setting: 'S3_ACCESS_KEY_ID',
        message:
          'required because S3 document storage is configured (MINIO_APP_USER is no longer read)',
      },
    ]);
  });
});

describe('document storage', () => {
  const S3_ENV = {
    S3_ENDPOINT: 'http://s3.internal:9000',
    S3_REGION: 'eu-west-1',
    S3_BUCKET: 'quro-documents',
    S3_ACCESS_KEY_ID: 'quro_app',
  };
  const S3_SECRETS = { ...SECRETS, '/run/secrets/s3_secret_access_key': `${CANARY}-s3\n` };

  test('is off when no S3 setting is present', () => {
    expect(load(DATABASE_ENV).config.documents).toEqual({ enabled: false });
  });

  test('is on with a complete configuration', () => {
    const { config } = load({ ...DATABASE_ENV, ...S3_ENV }, S3_SECRETS);
    expect(config.documents).toMatchObject({
      enabled: true,
      endpoint: 'http://s3.internal:9000',
      region: 'eu-west-1',
      bucket: 'quro-documents',
      accessKeyId: 'quro_app',
      forcePathStyle: true,
    });
    if (!config.documents.enabled) throw new Error('expected documents to be enabled');
    expect(config.documents.secretAccessKey.reveal()).toBe(`${CANARY}-s3`);
  });

  test('a partial configuration lists every missing setting', () => {
    const { problems } = load({ ...DATABASE_ENV, S3_BUCKET: 'docs' }, S3_SECRETS);
    expect(problems.documents.map((p) => p.setting).sort()).toEqual([
      'S3_ACCESS_KEY_ID',
      'S3_ENDPOINT',
      'S3_REGION',
    ]);
  });

  test('a secret file at its default location does not turn S3 on by itself', () => {
    const { config, problems } = load(DATABASE_ENV, S3_SECRETS);
    expect(config.documents).toEqual({ enabled: false });
    expect(problems.documents).toEqual([]);
  });

  test('the secret is found at its default location once S3 is configured', () => {
    const { config } = load({ ...DATABASE_ENV, ...S3_ENV }, S3_SECRETS);
    expect(config.documents.enabled).toBe(true);
  });

  test('reads the secret from a configured file and honours path style', () => {
    const { config } = load(
      {
        ...DATABASE_ENV,
        ...S3_ENV,
        S3_SECRET_ACCESS_KEY_FILE: '/custom/secret',
        S3_FORCE_PATH_STYLE: 'false',
      },
      { '/custom/secret': 'abc' },
    );
    expect(config.documents).toMatchObject({ enabled: true, forcePathStyle: false });
  });

  test('rejects a malformed endpoint without echoing it', () => {
    const { problems } = load(
      { ...DATABASE_ENV, ...S3_ENV, S3_ENDPOINT: `not-a-url-${CANARY}` },
      S3_SECRETS,
    );
    expect(problems.documents).toEqual([
      { setting: 'S3_ENDPOINT', message: 'must be an http or https URL' },
    ]);
  });
});

describe('bunq', () => {
  const FULL = {
    BUNQ_CLIENT_ID: 'client-id-value',
    BUNQ_CLIENT_SECRET: 'client-secret-value',
    BUNQ_REDIRECT_URI: 'https://quro.example/api/bunq/oauth/callback',
    FRONTEND_ORIGIN: 'https://quro.example/',
  };

  test('is off when nothing is configured, and FRONTEND_ORIGIN alone does not turn it on', () => {
    expect(load(DATABASE_ENV).config.bunq).toEqual({ enabled: false });
    const { config, problems } = load({ ...DATABASE_ENV, FRONTEND_ORIGIN: 'https://quro.example' });
    expect(config.bunq).toEqual({ enabled: false });
    expect(problems.bunq).toEqual([]);
    expect(config.web.frontendOrigin).toBe('https://quro.example');
  });

  test('blank values count as unset', () => {
    expect(load({ ...DATABASE_ENV, BUNQ_CLIENT_ID: '  ' }).config.bunq).toEqual({ enabled: false });
  });

  test('is on with a complete configuration and normalises the origin', () => {
    const { config } = load({ ...DATABASE_ENV, ...FULL });
    if (!config.bunq.enabled) throw new Error('expected bunq to be enabled');
    expect(config.bunq.clientId.reveal()).toBe('client-id-value');
    expect(config.bunq.clientSecret.reveal()).toBe('client-secret-value');
    expect(config.bunq.redirectUri).toBe(FULL.BUNQ_REDIRECT_URI);
    expect(config.bunq.frontendOrigin).toBe('https://quro.example');
    expect(config.bunq.sandbox).toBe(false);
  });

  test.each(Object.keys(FULL))('a partial configuration missing %s is reported', (missing) => {
    const env: Record<string, string> = { ...DATABASE_ENV, ...FULL };
    delete env[missing];
    const { problems } = load(env);
    expect(problems.bunq.map((p) => p.setting)).toEqual([missing]);
  });

  test('accepts client credentials from files; the value wins over the file', () => {
    const { config } = load(
      {
        ...DATABASE_ENV,
        BUNQ_REDIRECT_URI: FULL.BUNQ_REDIRECT_URI,
        FRONTEND_ORIGIN: FULL.FRONTEND_ORIGIN,
        BUNQ_CLIENT_ID: 'from-env',
      },
      {
        ...SECRETS,
        '/run/secrets/bunq_client_id': 'from-file\n',
        '/run/secrets/bunq_client_secret': 'secret-from-file\n',
      },
    );
    if (!config.bunq.enabled) throw new Error('expected bunq to be enabled');
    expect(config.bunq.clientId.reveal()).toBe('from-env');
    expect(config.bunq.clientSecret.reveal()).toBe('secret-from-file');
  });

  test('a configured secret file that cannot be read is an error', () => {
    const { problems } = load({
      ...DATABASE_ENV,
      ...FULL,
      BUNQ_CLIENT_SECRET: '',
      BUNQ_CLIENT_SECRET_FILE: '/nope',
    });
    expect(problems.bunq).toEqual([
      { setting: 'BUNQ_CLIENT_SECRET_FILE', message: 'secret file not found at /nope' },
    ]);
  });

  test('rejects invalid URLs without echoing any configured value', () => {
    const env = { ...DATABASE_ENV, ...FULL, BUNQ_REDIRECT_URI: `not a url ${CANARY}` };
    const { problems } = load(env);
    expect(problems.bunq).toEqual([
      { setting: 'BUNQ_REDIRECT_URI', message: 'must be an http or https URL' },
    ]);
    expect(JSON.stringify(problems)).not.toContain(CANARY);
    expect(JSON.stringify(problems)).not.toContain(FULL.BUNQ_CLIENT_SECRET);
  });

  test('BUNQ_SANDBOX is a strict switch', () => {
    const { config } = load({ ...DATABASE_ENV, ...FULL, BUNQ_SANDBOX: 'true' });
    expect(config.bunq.enabled && config.bunq.sandbox).toBe(true);
    expect(problemsOf({ ...DATABASE_ENV, ...FULL, BUNQ_SANDBOX: 'ture' }, 'bunq')).toEqual([
      { setting: 'BUNQ_SANDBOX', message: 'must be true, false, 1, 0, yes or no' },
    ]);
  });
});

describe('malformed settings', () => {
  test('are all reported together, by name, without echoing their values', () => {
    const { problems } = load({
      ...DATABASE_ENV,
      PORT: `70000${CANARY}`,
      QRO_DISABLE_SCHEDULERS: `maybe${CANARY}`,
      SESSION_CLEANUP_INTERVAL_MS: '0',
      SECURE_COOKIES: 'TRUE',
      QRO_REGISTRATION_MODE: `everyone${CANARY}`,
      TRUSTED_PROXIES: `not-an-ip${CANARY}`,
      FRONTEND_ORIGIN: `ftp://${CANARY}`,
      PENSION_PARSER_URL: 'nonsense',
      IMPORT_WORKER_POLL_INTERVAL_MS: '100',
    });
    const flat = [...problems.runtime, ...problems.web, ...problems.pensionImport];
    expect(flat.map((p) => p.setting).sort()).toEqual([
      'FRONTEND_ORIGIN',
      'IMPORT_WORKER_POLL_INTERVAL_MS',
      'PENSION_PARSER_URL',
      'PORT',
      'QRO_DISABLE_SCHEDULERS',
      'QRO_REGISTRATION_MODE',
      'SECURE_COOKIES',
      'SESSION_CLEANUP_INTERVAL_MS',
      'TRUSTED_PROXIES',
    ]);
    expect(JSON.stringify(problems)).not.toContain(CANARY);
  });

  test('a section with problems throws one ConfigError that lists them all', () => {
    const { config } = load({ ...DATABASE_ENV, PORT: 'abc', SESSION_CLEANUP_INTERVAL_MS: 'x' });
    try {
      void config.runtime;
      throw new Error('expected a ConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const { problems, message, exitCode } = error as ConfigError;
      expect(exitCode).toBe(2);
      expect(problems.map((p) => p.setting)).toEqual(['PORT', 'SESSION_CLEANUP_INTERVAL_MS']);
      expect(message).toContain('Invalid configuration (2 problems):');
      expect(message).toContain('  - PORT: must be a whole number, 1 to 65535');
    }
  });

  test('SECURE_COOKIES accepts only the two literal words', () => {
    expect(load({ ...DATABASE_ENV, SECURE_COOKIES: 'true' }).config.web.secureCookies).toBe(true);
    expect(load({ ...DATABASE_ENV, SECURE_COOKIES: 'false' }).config.web.secureCookies).toBe(false);
    for (const value of ['TRUE', '1', 'yes']) {
      expect(problemsOf({ ...DATABASE_ENV, SECURE_COOKIES: value }, 'web')).toEqual([
        { setting: 'SECURE_COOKIES', message: 'must be "true" or "false"' },
      ]);
    }
  });

  test('QRO_DISABLE_SCHEDULERS reads the usual switch words', () => {
    for (const [value, expected] of [
      ['1', true],
      ['true', true],
      ['yes', true],
      ['0', false],
      ['false', false],
      ['no', false],
      ['', false],
    ] as const) {
      expect(
        load({ ...DATABASE_ENV, QRO_DISABLE_SCHEDULERS: value }).config.runtime.schedulersDisabled,
      ).toBe(expected);
    }
  });

  test('NODE_ENV and BUN_ENV decide the test environment; other values count as development', () => {
    expect(load({ ...DATABASE_ENV, NODE_ENV: 'test' }).config.runtime.environment).toBe('test');
    expect(load({ ...DATABASE_ENV, BUN_ENV: 'test' }).config.runtime.environment).toBe('test');
    expect(load({ ...DATABASE_ENV, NODE_ENV: 'production' }).config.runtime.environment).toBe(
      'production',
    );
    expect(load({ ...DATABASE_ENV, NODE_ENV: 'staging' }).config.runtime.environment).toBe(
      'development',
    );
  });

  test('CORS_ORIGIN lists origins, and a wildcard falls back to the defaults with a notice', () => {
    const origins = load({ ...DATABASE_ENV, CORS_ORIGIN: 'https://a.example, https://b.example' });
    expect(origins.config.web.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
    const wildcard = load({ ...DATABASE_ENV, CORS_ORIGIN: '*' });
    expect(wildcard.config.web.corsOrigins).toEqual([
      'http://localhost:3000',
      'http://localhost:5173',
    ]);
    expect(wildcard.config.notices).toEqual([expect.objectContaining({ setting: 'CORS_ORIGIN' })]);
  });

  test('TRUSTED_PROXIES accepts addresses and IPv4 CIDRs', () => {
    const { config } = load({ ...DATABASE_ENV, TRUSTED_PROXIES: '172.16.0.0/12, ::1' });
    expect(config.web.trustedProxies?.check('172.18.0.5', 'ipv4')).toBe(true);
    expect(config.web.trustedProxies?.check('8.8.8.8', 'ipv4')).toBe(false);
  });
});

describe('tracing', () => {
  test('is off until an endpoint is set and OTEL_SDK_DISABLED is not true', () => {
    expect(load(DATABASE_ENV).config.tracing.enabled).toBe(false);
    const on = load({ ...DATABASE_ENV, OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/' });
    expect(on.config.tracing).toEqual({
      enabled: true,
      tracesUrl: 'http://collector:4318/v1/traces',
      serviceName: 'quro-backend',
    });
    const traces = load({
      ...DATABASE_ENV,
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://collector:4318/custom',
      OTEL_SERVICE_NAME: 'quro-test',
    });
    expect(traces.config.tracing).toMatchObject({
      tracesUrl: 'http://collector:4318/custom',
      serviceName: 'quro-test',
    });
    const off = load({
      ...DATABASE_ENV,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      OTEL_SDK_DISABLED: 'true',
    });
    expect(off.config.tracing.enabled).toBe(false);
  });
});

describe('statement import', () => {
  test('reads the parser URL and the bounds', () => {
    const { config } = load({
      ...DATABASE_ENV,
      PENSION_PARSER_URL: 'http://pension-parser:8080',
      PENSION_PARSER_TIMEOUT_MS: '1000',
      IMPORT_DRAFT_TTL_DAYS: '14',
      IMPORT_WORKER_POLL_INTERVAL_MS: '500',
    });
    expect(config.pensionImport).toEqual({
      parserUrl: 'http://pension-parser:8080',
      parserTimeoutMs: 1000,
      draftTtlDays: 14,
      workerPollIntervalMs: 500,
    });
  });
});

describe('secrets cannot leak by accident', () => {
  test('serialising or printing the configuration shows no credential', () => {
    const { config } = load({
      ...DATABASE_ENV,
      BUNQ_CLIENT_ID: CANARY,
      BUNQ_CLIENT_SECRET: CANARY,
      BUNQ_REDIRECT_URI: 'https://quro.example/cb',
      FRONTEND_ORIGIN: 'https://quro.example',
      DEMO_USER_PASSWORD: CANARY,
    });
    const rendered = [
      JSON.stringify(config),
      inspect(config, { depth: 6 }),
      `${config.runtimeDatabase.password} ${config.runtimeDatabase.url}`,
    ].join('\n');
    expect(rendered).not.toContain(CANARY);
    expect(rendered).toContain('[redacted]');
  });
});
