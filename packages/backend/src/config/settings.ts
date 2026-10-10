import { isAbsolute, resolve } from 'node:path';
import { REGISTRATION_MODES } from '@quro/shared';
import { parseTrustedProxies, type TrustedProxies } from '../lib/clientAddress';

// The single table of backend settings. The loader (load.ts) reads a setting only through its
// entry here, and the manifest (manifest.ts) is generated from the same entries, so the parser,
// the documentation and the installer cannot disagree about a name, a default or a type.
//
// Values are never echoed in errors: a setting that holds a secret in the wrong place must not
// end up in a log. `SettingValueError` messages describe the accepted form instead.

export class SettingValueError extends Error {}

export type SettingAudience = 'operator' | 'development';

export type SettingGroup =
  | 'Runtime'
  | 'Web and sessions'
  | 'Database'
  | 'Document storage'
  | 'bunq'
  | 'Statement import'
  | 'Tracing'
  | 'Maintenance'
  | 'Backups'
  | 'Demo data';

// Named up front because the settings below refer to their features and the features to the
// settings; `FEATURES` is checked against this list.
export type FeatureName = 's3Storage' | 'bunq';

/** When the loader reports a missing value for this setting. */
export type SettingRequirement =
  | { kind: 'never' }
  /** Required whenever the section that owns it is loaded. */
  | { kind: 'always'; note?: string }
  /** Required once any setting that turns the feature on is present (see `FEATURES`). */
  | { kind: 'feature'; feature: FeatureName }
  /** Required for the connection of a database role unless a full URL is given. */
  | { kind: 'unlessUrl'; note: string };

export type SettingDefinition<T> = {
  group: SettingGroup;
  audience: SettingAudience;
  description: string;
  /** Short type label for the manifest. */
  type: string;
  parse: (raw: string) => T;
  default?: T;
  /** Default as shown to operators when it is not a plain value. */
  defaultLabel?: string;
  /** `file`: the value is a path to a file holding the secret. `value`: the value itself is secret. */
  secret?: 'file' | 'value';
  /** Example shown in generated settings files. Never a real credential. */
  example?: string;
  requirement: SettingRequirement;
};

type Meta<T> = Pick<
  SettingDefinition<T>,
  'group' | 'audience' | 'description' | 'secret' | 'example' | 'defaultLabel'
> & { requirement?: SettingRequirement; default?: T };

function define<T>(type: string, parse: (raw: string) => T, meta: Meta<T>): SettingDefinition<T> {
  return { ...meta, type, parse, requirement: meta.requirement ?? { kind: 'never' } };
}

const text = (meta: Meta<string>) => define('text', (raw) => raw, meta);

const path = (meta: Meta<string>) => define('file path', (raw) => raw, meta);

const secretValue = (meta: Omit<Meta<string>, 'secret'>) =>
  define('text', (raw) => raw, { ...meta, secret: 'value' });

function integer(meta: Meta<number> & { min: number; max?: number }) {
  const range = meta.max === undefined ? `${meta.min} or more` : `${meta.min} to ${meta.max}`;
  return define(
    'integer',
    (raw) => {
      const parsed = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
      if (!Number.isSafeInteger(parsed) || parsed < meta.min || parsed > (meta.max ?? Infinity)) {
        throw new SettingValueError(`must be a whole number, ${range}`);
      }
      return parsed;
    },
    meta,
  );
}

const TRUE_VALUES = new Set(['1', 'true', 'yes']);
const FALSE_VALUES = new Set(['0', 'false', 'no']);

function flag(meta: Meta<boolean>) {
  return define(
    'true or false',
    (raw) => {
      const value = raw.toLowerCase();
      if (TRUE_VALUES.has(value)) return true;
      if (FALSE_VALUES.has(value)) return false;
      throw new SettingValueError('must be true, false, 1, 0, yes or no');
    },
    meta,
  );
}

// A typo in these must never fall back to the lenient reading, so only the two literal words count.
function strictFlag(meta: Meta<boolean>) {
  return define(
    'true or false',
    (raw) => {
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new SettingValueError('must be "true" or "false"');
    },
    meta,
  );
}

function choice<const V extends readonly string[]>(values: V, meta: Meta<V[number]>) {
  return define(
    values.join(' | '),
    (raw): V[number] => {
      if (!(values as readonly string[]).includes(raw)) {
        throw new SettingValueError(`must be one of ${values.join(', ')}`);
      }
      return raw;
    },
    meta,
  );
}

export function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === 'http:' || protocol === 'https:';
}

function absoluteDirectory(meta: Meta<string>) {
  return define(
    'absolute directory path',
    (raw) => {
      // A relative path would depend on the working directory of each command, so the server and
      // `quro documents migrate-from-s3` could disagree about where documents live.
      if (!isAbsolute(raw)) throw new SettingValueError('must be an absolute path');
      const normalised = resolve(raw);
      if (normalised === resolve('/')) {
        throw new SettingValueError('must be a directory below the filesystem root');
      }
      return normalised;
    },
    meta,
  );
}

const httpUrl = (meta: Meta<string>) =>
  define(
    'http(s) URL',
    (raw) => {
      if (!isHttpUrl(raw)) throw new SettingValueError('must be an http or https URL');
      return raw;
    },
    meta,
  );

const httpOrigin = (meta: Meta<string>) =>
  define(
    'http(s) origin',
    (raw) => {
      if (!isHttpUrl(raw)) throw new SettingValueError('must be an http or https URL');
      return new URL(raw).origin;
    },
    meta,
  );

export const DOCUMENT_STORAGE_DRIVERS = ['filesystem', 's3'] as const;
export type DocumentStorageDriver = (typeof DOCUMENT_STORAGE_DRIVERS)[number];

export const DEFAULT_DOCUMENTS_DIR = '/var/lib/quro/documents';

export const DEFAULT_BACKUP_DIR = '/var/lib/quro/backups';

export const DEFAULT_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'] as const;

const POSTGRES_SSLMODES = [
  'disable',
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
] as const;

const NODE_ENVIRONMENTS = ['development', 'production', 'test'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

const DATABASE_URL_NOTE = 'unless a database URL setting is used (development and tests)';

// `any` keeps each entry's own value type; a wider bound would widen every entry to `unknown`.
function defineSettings<const R extends Record<string, SettingDefinition<any>>>(settings: R): R {
  return settings;
}

// Declaration order is the order of the manifest.
export const SETTINGS = defineSettings({
  // ── Runtime ──────────────────────────────────────────────────────────────
  PORT: integer({
    group: 'Runtime',
    audience: 'operator',
    description: 'Port the backend listens on inside its container.',
    min: 1,
    max: 65_535,
    default: 3000,
  }),
  HOST: text({
    group: 'Runtime',
    audience: 'operator',
    description: 'Interface the backend binds to.',
    default: '0.0.0.0',
  }),
  QRO_DISABLE_SCHEDULERS: flag({
    group: 'Runtime',
    audience: 'development',
    description:
      'Turns off every interval job (session cleanup, bunq sync, prices, exchange rates, net-worth snapshots). Smoke tests set it so a test backend never calls a provider. Leave unset in production.',
    default: false,
  }),
  SESSION_CLEANUP_INTERVAL_MS: integer({
    group: 'Runtime',
    audience: 'operator',
    description: 'How often expired sessions and operator codes are purged, in milliseconds.',
    min: 1,
    default: 86_400_000,
    defaultLabel: '86400000 (one day)',
  }),
  NODE_ENV: define<NodeEnvironment>(
    NODE_ENVIRONMENTS.join(' | '),
    (raw): NodeEnvironment =>
      (NODE_ENVIRONMENTS as readonly string[]).includes(raw)
        ? (raw as NodeEnvironment)
        : 'development',
    {
      group: 'Runtime',
      audience: 'development',
      description:
        'Runtime mode. Only `test` changes behaviour (no rate limiting, no schedulers); any other value counts as development. Bun sets it to `test` when it runs tests.',
      default: 'development',
    },
  ),

  // ── Web and sessions ─────────────────────────────────────────────────────
  SECURE_COOKIES: strictFlag({
    group: 'Web and sessions',
    audience: 'operator',
    description:
      'Marks session cookies Secure. `true` when browsers reach Quro over HTTPS (deployment mode B in docs/security.md), `false` for plain HTTP on a private network.',
    default: false,
  }),
  QRO_REGISTRATION_MODE: choice(REGISTRATION_MODES, {
    group: 'Web and sessions',
    audience: 'operator',
    description:
      'Who may create an account once the first one exists. `invite`: a single-use code per account. `closed`: nobody. `open`: anyone who can reach Quro.',
    default: 'invite',
  }),
  TRUSTED_PROXIES: define<TrustedProxies>(
    'comma-separated IPs or IPv4 CIDRs',
    (raw) => {
      try {
        return parseTrustedProxies(raw);
      } catch {
        throw new SettingValueError('contains an entry that is not an IP address or IPv4 CIDR');
      }
    },
    {
      group: 'Web and sessions',
      audience: 'operator',
      description:
        'Proxies allowed to set X-Real-IP and X-Forwarded-For for rate limiting. Unset trusts none.',
      defaultLabel: 'none',
      example: '172.16.0.0/12',
    },
  ),
  CORS_ORIGIN: define<readonly string[]>(
    'comma-separated origins',
    (raw) =>
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    {
      group: 'Web and sessions',
      audience: 'operator',
      description:
        'Browser origins allowed to call the backend directly. Same-origin traffic through the bundled nginx does not need it. A `*` is not accepted with credentials and falls back to the default.',
      default: DEFAULT_CORS_ORIGINS,
      defaultLabel: DEFAULT_CORS_ORIGINS.join(','),
    },
  ),
  FRONTEND_ORIGIN: httpOrigin({
    group: 'Web and sessions',
    audience: 'operator',
    description:
      'Public origin browsers use to reach Quro. Required for bunq linking; also lets the backend warn when SECURE_COOKIES disagrees with it.',
    requirement: { kind: 'feature', feature: 'bunq' },
    example: 'https://quro.example.com',
  }),

  // ── Database ─────────────────────────────────────────────────────────────
  POSTGRES_HOST: define(
    'host name or address',
    (raw) => {
      if (!/^[\w.:[\]-]+$/.test(raw)) {
        throw new SettingValueError('must be a host name or IP address, without a port or path');
      }
      return raw;
    },
    {
      group: 'Database',
      audience: 'operator',
      description: 'PostgreSQL host. There is no default: Quro never assumes a service name.',
      requirement: { kind: 'unlessUrl', note: DATABASE_URL_NOTE },
      example: 'db',
    },
  ),
  POSTGRES_PORT: integer({
    group: 'Database',
    audience: 'operator',
    description: 'PostgreSQL port.',
    min: 1,
    max: 65_535,
    default: 5432,
  }),
  POSTGRES_DB: text({
    group: 'Database',
    audience: 'operator',
    description: 'Database name.',
    default: 'quro',
  }),
  POSTGRES_ADMIN_USER: text({
    group: 'Database',
    audience: 'operator',
    description: 'Owner role. Runs migrations, backup and restore.',
    default: 'quro_admin',
  }),
  POSTGRES_APP_USER: text({
    group: 'Database',
    audience: 'operator',
    description: 'Runtime role. Data access only, no schema changes.',
    default: 'quro_app',
  }),
  POSTGRES_ADMIN_PASSWORD_FILE: path({
    group: 'Database',
    audience: 'operator',
    description: 'File holding the owner role password. Read only by commands that need that role.',
    secret: 'file',
    default: '/run/secrets/postgres_admin_password',
    requirement: { kind: 'unlessUrl', note: DATABASE_URL_NOTE },
  }),
  POSTGRES_APP_PASSWORD_FILE: path({
    group: 'Database',
    audience: 'operator',
    description: 'File holding the runtime role password.',
    secret: 'file',
    default: '/run/secrets/postgres_app_password',
    requirement: { kind: 'unlessUrl', note: DATABASE_URL_NOTE },
  }),
  POSTGRES_SSLMODE: choice(POSTGRES_SSLMODES, {
    group: 'Database',
    audience: 'operator',
    description: 'Passed to the client as `sslmode`, for a database outside the host.',
    defaultLabel: 'unset (client default)',
  }),
  DATABASE_URL: secretValue({
    group: 'Database',
    audience: 'development',
    description:
      'Connection URL for both roles. A development and test interface; it carries a password in the environment and is not part of the operator contract.',
    example: 'postgres://user:password@127.0.0.1:5432/quro',
  }),
  ADMIN_DATABASE_URL: secretValue({
    group: 'Database',
    audience: 'development',
    description: 'Connection URL for the owner role. Takes precedence over DATABASE_URL.',
  }),
  APP_DATABASE_URL: secretValue({
    group: 'Database',
    audience: 'development',
    description: 'Connection URL for the runtime role. Takes precedence over DATABASE_URL.',
  }),
  BOOTSTRAP_DATABASE_URL: secretValue({
    group: 'Database',
    audience: 'development',
    description:
      'Superuser URL for `db:bootstrap-runtime-role` when the owner role cannot create roles. Defaults to the owner connection.',
  }),

  // ── Document storage ─────────────────────────────────────────────────────
  QRO_DOCUMENT_STORAGE: choice(DOCUMENT_STORAGE_DRIVERS, {
    group: 'Document storage',
    audience: 'operator',
    description:
      'Where uploaded documents are kept. `filesystem`: the directory QRO_DOCUMENTS_DIR. `s3`: an S3-compatible store set up with the S3_* settings. When it is unset but S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID or the retired MINIO_APP_USER is present, every command stops instead of guessing.',
    default: 'filesystem',
  }),
  QRO_DOCUMENTS_DIR: absoluteDirectory({
    group: 'Document storage',
    audience: 'operator',
    description:
      'Directory of the filesystem store, and where `quro documents migrate-from-s3` copies to. Must exist and be writable by the backend; the pension import worker mounts the same directory.',
    default: DEFAULT_DOCUMENTS_DIR,
  }),
  S3_ENDPOINT: httpUrl({
    group: 'Document storage',
    audience: 'operator',
    description: 'Endpoint of the S3-compatible store.',
    requirement: { kind: 'feature', feature: 's3Storage' },
    example: 'https://s3.example.com',
  }),
  S3_REGION: text({
    group: 'Document storage',
    audience: 'operator',
    description: 'Region name the store expects.',
    requirement: { kind: 'feature', feature: 's3Storage' },
    example: 'eu-west-1',
  }),
  S3_BUCKET: text({
    group: 'Document storage',
    audience: 'operator',
    description: 'Bucket for uploaded documents. Created by the operator.',
    requirement: { kind: 'feature', feature: 's3Storage' },
    example: 'quro-documents',
  }),
  S3_ACCESS_KEY_ID: text({
    group: 'Document storage',
    audience: 'operator',
    description: 'Access key id of an identity that can get, put, delete and list objects.',
    requirement: { kind: 'feature', feature: 's3Storage' },
  }),
  S3_SECRET_ACCESS_KEY_FILE: path({
    group: 'Document storage',
    audience: 'operator',
    description: 'File holding the secret access key.',
    secret: 'file',
    default: '/run/secrets/s3_secret_access_key',
    requirement: { kind: 'feature', feature: 's3Storage' },
  }),
  S3_FORCE_PATH_STYLE: flag({
    group: 'Document storage',
    audience: 'operator',
    description: 'Use path-style addressing, which most self-hosted stores need.',
    default: true,
  }),

  // ── bunq ─────────────────────────────────────────────────────────────────
  BUNQ_CLIENT_ID: secretValue({
    group: 'bunq',
    audience: 'operator',
    description: 'OAuth client id. Alternatively use BUNQ_CLIENT_ID_FILE.',
    requirement: { kind: 'feature', feature: 'bunq' },
  }),
  BUNQ_CLIENT_ID_FILE: path({
    group: 'bunq',
    audience: 'operator',
    description: 'File holding the OAuth client id. Used when BUNQ_CLIENT_ID is unset.',
    secret: 'file',
    default: '/run/secrets/bunq_client_id',
  }),
  BUNQ_CLIENT_SECRET: secretValue({
    group: 'bunq',
    audience: 'operator',
    description: 'OAuth client secret. Alternatively use BUNQ_CLIENT_SECRET_FILE.',
    requirement: { kind: 'feature', feature: 'bunq' },
  }),
  BUNQ_CLIENT_SECRET_FILE: path({
    group: 'bunq',
    audience: 'operator',
    description: 'File holding the OAuth client secret. Used when BUNQ_CLIENT_SECRET is unset.',
    secret: 'file',
    default: '/run/secrets/bunq_client_secret',
  }),
  BUNQ_REDIRECT_URI: httpUrl({
    group: 'bunq',
    audience: 'operator',
    description: 'OAuth redirect URI registered with bunq. Ends in /api/bunq/oauth/callback.',
    requirement: { kind: 'feature', feature: 'bunq' },
    example: 'https://quro.example.com/api/bunq/oauth/callback',
  }),
  BUNQ_SANDBOX: flag({
    group: 'bunq',
    audience: 'operator',
    description: 'Talk to the bunq sandbox instead of the production API.',
    default: false,
  }),

  // ── Statement import ─────────────────────────────────────────────────────
  PENSION_PARSER_URL: httpUrl({
    group: 'Statement import',
    audience: 'operator',
    description:
      'Address of the optional statement parser service. Unset leaves PDF statement import off.',
    example: 'http://pension-parser:8080',
  }),
  PENSION_PARSER_TIMEOUT_MS: integer({
    group: 'Statement import',
    audience: 'operator',
    description: 'How long one statement may take to parse, in milliseconds.',
    min: 1,
    default: 300_000,
  }),
  IMPORT_DRAFT_TTL_DAYS: integer({
    group: 'Statement import',
    audience: 'operator',
    description: 'Days an unconfirmed import draft is kept before it expires.',
    min: 1,
    default: 7,
  }),
  IMPORT_WORKER_POLL_INTERVAL_MS: integer({
    group: 'Statement import',
    audience: 'operator',
    description: 'How often the import worker looks for queued work, in milliseconds.',
    min: 500,
    default: 3000,
  }),

  // ── Tracing ──────────────────────────────────────────────────────────────
  OTEL_EXPORTER_OTLP_ENDPOINT: httpUrl({
    group: 'Tracing',
    audience: 'operator',
    description:
      'OTLP/HTTP collector base URL. Setting it turns tracing on. The exporter also honours the standard OTEL_EXPORTER_OTLP_HEADERS and OTEL_EXPORTER_OTLP_TIMEOUT variables.',
    example: 'http://otel-collector:4318',
  }),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: httpUrl({
    group: 'Tracing',
    audience: 'operator',
    description: 'Full OTLP/HTTP traces URL. Overrides OTEL_EXPORTER_OTLP_ENDPOINT for traces.',
  }),
  OTEL_SDK_DISABLED: strictFlag({
    group: 'Tracing',
    audience: 'operator',
    description: 'Turns tracing off even when an endpoint is set.',
    default: false,
  }),
  OTEL_SERVICE_NAME: text({
    group: 'Tracing',
    audience: 'operator',
    description: 'Service name on exported spans.',
    default: 'quro-backend',
  }),

  // ── Maintenance ──────────────────────────────────────────────────────────
  QRO_PG_DUMP_BIN: path({
    group: 'Maintenance',
    audience: 'development',
    description: 'Path to `pg_dump` when it is not on PATH.',
  }),
  QRO_PG_RESTORE_BIN: path({
    group: 'Maintenance',
    audience: 'development',
    description: 'Path to `pg_restore` when it is not on PATH.',
  }),
  QRO_PSQL_BIN: path({
    group: 'Maintenance',
    audience: 'development',
    description: 'Path to `psql` when it is not on PATH.',
  }),
  QRO_RESTORE_CONFIRM: text({
    group: 'Maintenance',
    audience: 'operator',
    description: 'Must be `restore-db` for a restore to run.',
  }),
  QRO_RESTORE_ALLOW_NON_EMPTY: text({
    group: 'Maintenance',
    audience: 'operator',
    description: '`1` allows a restore over a database that already holds data.',
  }),
  QRO_CLEAR_CONFIRM: text({
    group: 'Maintenance',
    audience: 'development',
    description: 'Must be `clear-all-data` for `db:clear` to run.',
  }),
  QRO_CLEAR_ALLOW_NON_EMPTY: text({
    group: 'Maintenance',
    audience: 'development',
    description: '`1` allows `db:clear` on a database that already holds data.',
  }),

  // ── Backups ──────────────────────────────────────────────────────────────
  QRO_BACKUP_DIR: absoluteDirectory({
    group: 'Backups',
    audience: 'operator',
    description:
      'Directory `quro backup` writes archives to, and where `quro restore` writes its pre-restore archive. Must exist and be writable by the backend; Quro never creates it.',
    default: DEFAULT_BACKUP_DIR,
  }),
  QRO_BACKUP_ENCRYPTION_KEY_FILE: path({
    group: 'Backups',
    audience: 'operator',
    description:
      'File holding the key that encrypts backup archives, at least 32 characters. Unset writes unencrypted archives. The key is never in a backup: keep a copy elsewhere, because an encrypted archive cannot be restored without it.',
    secret: 'file',
  }),
  QRO_BACKUP_OFFSITE_DIR: absoluteDirectory({
    group: 'Backups',
    audience: 'operator',
    description:
      'A directory on another device (a network share or a removable disk mounted into the container). Every archive is copied there and the copy is checked. Needs QRO_BACKUP_ENCRYPTION_KEY_FILE.',
  }),
  QRO_BACKUP_KEEP: integer({
    group: 'Backups',
    audience: 'operator',
    description:
      'How many unlabelled archives `quro backup` keeps in each backup directory. Older ones are deleted only after the new archive has been verified. Unset keeps every archive.',
    min: 1,
  }),

  // ── Demo data ────────────────────────────────────────────────────────────
  DEMO_USER_PASSWORD: secretValue({
    group: 'Demo data',
    audience: 'development',
    description:
      'Password of the demo account created by `db:seed-demo`. Defaults to a fixed demo value.',
  }),
});

export type SettingName = keyof typeof SETTINGS;
export type SettingValue<K extends SettingName> =
  (typeof SETTINGS)[K] extends SettingDefinition<infer T> ? T : never;

// Features that stay off until one of their settings is present, and then need all of theirs.
// Partial configuration is an error, never a silently half-enabled feature.
export const FEATURES = {
  // All or nothing, like every feature. QRO_DOCUMENT_STORAGE=s3 selects the store; the settings
  // alone never do (they stop every command until QRO_DOCUMENT_STORAGE says what to use).
  s3Storage: {
    label: 'S3 document storage',
    enabledBy: [
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY_FILE',
    ],
    requires: [
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY_FILE',
    ],
  },
  // FRONTEND_ORIGIN is shared with the rest of the app, so on its own it does not signal intent.
  bunq: {
    label: 'bunq linking',
    enabledBy: [
      'BUNQ_CLIENT_ID',
      'BUNQ_CLIENT_ID_FILE',
      'BUNQ_CLIENT_SECRET',
      'BUNQ_CLIENT_SECRET_FILE',
      'BUNQ_REDIRECT_URI',
    ],
    requires: ['BUNQ_CLIENT_ID', 'BUNQ_CLIENT_SECRET', 'BUNQ_REDIRECT_URI', 'FRONTEND_ORIGIN'],
  },
} as const satisfies Record<
  FeatureName,
  { label: string; enabledBy: SettingName[]; requires: SettingName[] }
>;

// Settings that earlier releases read and this one does not. They are never used as a fallback;
// finding one is reported so an upgrade does not fail silently (docs/install-contract.md).
export const RETIRED_SETTINGS = {
  DATABASE_HOST: 'POSTGRES_HOST',
  DATABASE_PORT: 'POSTGRES_PORT',
  APP_DB_USER: 'POSTGRES_APP_USER',
  APP_DB_PASSWORD: 'POSTGRES_APP_PASSWORD_FILE',
  POSTGRES_USER: 'POSTGRES_APP_USER',
  POSTGRES_PASSWORD: 'POSTGRES_APP_PASSWORD_FILE and POSTGRES_ADMIN_PASSWORD_FILE',
  POSTGRES_ADMIN_PASSWORD: 'POSTGRES_ADMIN_PASSWORD_FILE',
  POSTGRES_APP_PASSWORD: 'POSTGRES_APP_PASSWORD_FILE',
  MINIO_APP_USER: 'S3_ACCESS_KEY_ID',
  S3_SECRET_ACCESS_KEY: 'S3_SECRET_ACCESS_KEY_FILE',
} as const satisfies Record<string, string>;

export type RetiredSettingName = keyof typeof RETIRED_SETTINGS;

/**
 * Settings that show an install used S3 before QRO_DOCUMENT_STORAGE existed. Finding one without
 * QRO_DOCUMENT_STORAGE stops every command: falling back to the filesystem would hide the
 * documents that are still in the store (docs/install-contract.md).
 */
export const S3_SELECTION_SIGNALS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'MINIO_APP_USER',
] as const satisfies readonly (SettingName | RetiredSettingName)[];
