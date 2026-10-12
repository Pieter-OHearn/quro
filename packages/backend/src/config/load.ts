import { readFileSync } from 'node:fs';
import type { RegistrationMode } from '@quro/shared';
import type { TrustedProxies } from '../lib/clientAddress';
import { Secret } from './secret';
import {
  DEFAULT_CORS_ORIGINS,
  FEATURES,
  RETIRED_SETTINGS,
  S3_SELECTION_SIGNALS,
  SETTINGS,
  SettingValueError,
  type DocumentStorageDriver,
  type FeatureName,
  type NodeEnvironment,
  type SettingName,
  type SettingValue,
} from './settings';

export type ConfigProblem = { setting: string; message: string };

/** Something worth telling the operator that does not stop startup. */
export type ConfigNotice = { setting: string; message: string };

/** Exit code of a command stopped by invalid settings (docs/install-contract.md). */
const SETTINGS_INVALID_EXIT_CODE = 2;

export class ConfigError extends Error {
  readonly exitCode = SETTINGS_INVALID_EXIT_CODE;

  constructor(readonly problems: readonly ConfigProblem[]) {
    super(formatProblems(problems));
    this.name = 'ConfigError';
  }
}

export function formatProblems(problems: readonly ConfigProblem[]): string {
  const lines = problems.map(({ setting, message }) => `  - ${setting}: ${message}`);
  const noun = problems.length === 1 ? 'problem' : 'problems';
  return [`Invalid configuration (${problems.length} ${noun}):`, ...lines].join('\n');
}

export type DatabaseRole = {
  /** `url`: a full connection URL was given. `settings`: built from POSTGRES_* settings. */
  source: 'url' | 'settings';
  user: string;
  password: Secret;
  host: string;
  port: number;
  database: string;
  /** Connection string including the password. */
  url: Secret;
};

export type AdminDatabase = DatabaseRole & {
  /** Where `db:bootstrap-runtime-role` connects; the owner connection unless overridden. */
  bootstrapUrl: Secret;
};

export type { DocumentStorageDriver };

/** Connection to an S3-compatible store. */
export type S3Connection = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: Secret;
  forcePathStyle: boolean;
};

/**
 * Which store holds documents and where the filesystem store lives. Reads no secret, so every
 * command can check it: S3 settings without QRO_DOCUMENT_STORAGE must stop all of them.
 */
export type DocumentStorageConfig = {
  driver: DocumentStorageDriver;
  /** The filesystem store's directory; also the destination of `migrate-from-s3`. */
  directory: string;
};

/** What the server and the worker need to read and write documents. */
export type DocumentsConfig =
  { driver: 'filesystem'; directory: string } | { driver: 's3'; s3: S3Connection };

/** The S3 settings on their own, whatever the driver: the source of `migrate-from-s3`. */
export type S3SourceConfig = { enabled: false } | ({ enabled: true } & S3Connection);

export type BunqConfig =
  | { enabled: false }
  | {
      enabled: true;
      clientId: Secret;
      clientSecret: Secret;
      redirectUri: string;
      frontendOrigin: string;
      sandbox: boolean;
    };

export type RuntimeConfig = {
  environment: NodeEnvironment;
  port: number;
  host: string;
  schedulersDisabled: boolean;
  sessionCleanupIntervalMs: number;
};

export type WebConfig = {
  secureCookies: boolean;
  registrationMode: RegistrationMode;
  trustedProxies: TrustedProxies;
  corsOrigins: readonly string[];
  /** Normalised origin, or null when the deployment does not say. */
  frontendOrigin: string | null;
};

export type PensionImportConfig = {
  parserUrl: string | null;
  parserTimeoutMs: number;
  draftTtlDays: number;
  workerPollIntervalMs: number;
};

export type TracingConfig = {
  enabled: boolean;
  /** Full traces URL the exporter posts to, or null when tracing is off. */
  tracesUrl: string | null;
  serviceName: string;
};

export type ToolsConfig = {
  pgDump: string | null;
  pgRestore: string | null;
  psql: string | null;
};

export type MaintenanceConfig = {
  restoreConfirm: string | null;
  restoreAllowNonEmpty: boolean;
  clearConfirm: string | null;
  clearAllowNonEmpty: boolean;
};

export type DemoConfig = { userPassword: Secret | null };

/** Where `quro backup` writes archives, and how they are protected and pruned. */
export type BackupConfig = {
  directory: string;
  /** Archives are encrypted when a key is configured. */
  encryptionKey: Secret | null;
  /** A directory on another device that receives a verified copy of every archive. */
  offsiteDirectory: string | null;
  /** Unlabelled archives kept per directory; null keeps every archive. */
  keep: number | null;
};

/**
 * The parsed configuration. Each property is a section; a section whose settings are invalid
 * throws a `ConfigError` when read, so a command only fails for the settings it uses (a migration
 * job does not need bunq). `bootConfig` reads every section a process needs at startup, which
 * reports all problems in one go.
 */
export type Config = {
  readonly runtime: RuntimeConfig;
  readonly web: WebConfig;
  readonly runtimeDatabase: DatabaseRole;
  readonly adminDatabase: AdminDatabase;
  readonly documentStorage: DocumentStorageConfig;
  readonly documents: DocumentsConfig;
  readonly s3: S3SourceConfig;
  readonly bunq: BunqConfig;
  readonly pensionImport: PensionImportConfig;
  readonly tracing: TracingConfig;
  readonly tools: ToolsConfig;
  readonly maintenance: MaintenanceConfig;
  readonly backup: BackupConfig;
  readonly demo: DemoConfig;
  /** Retired settings found in the environment and other non-fatal observations. */
  readonly notices: readonly ConfigNotice[];
};

export type SectionName = Exclude<keyof Config, 'notices'>;

export type Environment = Readonly<Record<string, string | undefined>>;
export type ReadFile = (path: string) => string;

export type LoadedConfig = {
  config: Config;
  problems: Readonly<Record<SectionName, readonly ConfigProblem[]>>;
};

type SecretRead =
  | { ok: true; path: string; explicit: boolean; value: Secret }
  | { ok: false; path: string; explicit: boolean; reason: 'missing' | 'unreadable' | 'empty' };

const SECRET_FILE_PROBLEMS = {
  missing: 'secret file not found at',
  unreadable: 'secret file cannot be read at',
  empty: 'secret file is empty at',
} as const;

// A trailing newline is ignored, anything else is part of the secret.
const TRAILING_NEWLINES = /[\r\n]+$/;

class Reader {
  readonly problems: ConfigProblem[] = [];
  private readonly failed = new Set<string>();

  constructor(
    private readonly env: Environment,
    private readonly readFile: ReadFile,
  ) {}

  raw(name: SettingName): string | undefined {
    const value = this.env[name]?.trim();
    return value ? value : undefined;
  }

  /** Whether the environment holds a value for a name, including retired ones. */
  hasValue(name: string): boolean {
    return Boolean(this.env[name]?.trim());
  }

  fail(setting: string, message: string): void {
    this.failed.add(setting);
    this.problems.push({ setting, message: withRetiredHint(this.env, setting, message) });
  }

  /** The parsed value, the documented default when unset, or undefined after recording a problem. */
  get<K extends SettingName>(name: K): SettingValue<K> | undefined {
    const definition = SETTINGS[name];
    const raw = this.raw(name);
    if (raw === undefined) return definition.default as SettingValue<K> | undefined;
    try {
      return definition.parse(raw) as SettingValue<K>;
    } catch (error) {
      if (!(error instanceof SettingValueError)) throw error;
      this.fail(name, error.message);
      return undefined;
    }
  }

  /** For settings with a default: the value is defined unless the section already has a problem. */
  must<K extends SettingName>(name: K): SettingValue<K> {
    return this.get(name) as SettingValue<K>;
  }

  /** Reads the secret a `*_FILE` setting points at, without recording a problem. */
  secretFile(name: SettingName): SecretRead {
    const definition = SETTINGS[name];
    const explicitPath = this.raw(name);
    const path = explicitPath ?? (definition.default as string);
    const explicit = explicitPath !== undefined;
    let contents: string;
    try {
      contents = this.readFile(path);
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      return { ok: false, path, explicit, reason: missing ? 'missing' : 'unreadable' };
    }
    const value = contents.replace(TRAILING_NEWLINES, '');
    if (value === '') return { ok: false, path, explicit, reason: 'empty' };
    return { ok: true, path, explicit, value: new Secret(value) };
  }

  /** Reads a required secret file and records a problem naming the path when it is unusable. */
  needSecretFile(name: SettingName): Secret | undefined {
    const read = this.secretFile(name);
    if (read.ok) return read.value;
    this.fail(name, `${SECRET_FILE_PROBLEMS[read.reason]} ${read.path}`);
    return undefined;
  }

  /**
   * Whether the environment sets it. A secret file at its default location does not count: a
   * generated secrets directory must not switch an optional feature on by itself.
   */
  isSet(name: SettingName): boolean {
    return this.raw(name) !== undefined;
  }

  /**
   * A secret given either as a value or through its `_FILE` twin. The value wins. A twin that is
   * named explicitly must be usable; one at its default location is optional.
   */
  secretValueOrFile(name: SettingName, fileName: SettingName): Secret | undefined {
    const direct = this.raw(name);
    if (direct !== undefined) return new Secret(direct);
    const read = this.secretFile(fileName);
    if (read.ok) return read.value;
    if (read.explicit) {
      this.fail(fileName, `${SECRET_FILE_PROBLEMS[read.reason]} ${read.path}`);
      this.failed.add(name);
    }
    return undefined;
  }

  featureConfigured(feature: FeatureName): boolean {
    return (FEATURES[feature].enabledBy as readonly SettingName[]).some((name) => this.isSet(name));
  }

  /** Records one problem per setting the feature needs and lacks. Returns whether none are missing. */
  requireFeatureSettings(feature: FeatureName, present: ReadonlySet<SettingName>): boolean {
    const { label, requires } = FEATURES[feature];
    let complete = true;
    for (const name of requires as readonly SettingName[]) {
      if (present.has(name) || this.failed.has(name)) continue;
      const twin = `${name}_FILE`;
      const alternative = twin in SETTINGS ? ` (or ${twin})` : '';
      this.fail(name, `required${alternative} because ${label} is configured`);
      complete = false;
    }
    return complete;
  }
}

function withRetiredHint(env: Environment, setting: string, message: string): string {
  const retired = Object.entries(RETIRED_SETTINGS).find(
    ([name, replacement]) => env[name]?.trim() && replacement.split(' and ').includes(setting),
  );
  return retired ? `${message} (${retired[0]} is no longer read)` : message;
}

// ── Sections ───────────────────────────────────────────────────────────────

function buildRuntime(r: Reader): RuntimeConfig {
  const nodeEnv = r.must('NODE_ENV');
  const environment = nodeEnv;
  return {
    environment,
    port: r.must('PORT'),
    host: r.must('HOST'),
    schedulersDisabled: r.must('QRO_DISABLE_SCHEDULERS'),
    sessionCleanupIntervalMs: r.must('SESSION_CLEANUP_INTERVAL_MS'),
  };
}

function buildWeb(r: Reader, notices: ConfigNotice[]): WebConfig {
  let corsOrigins = r.must('CORS_ORIGIN');
  if (corsOrigins.includes('*')) {
    notices.push({
      setting: 'CORS_ORIGIN',
      message: 'a wildcard origin is not allowed with credentials; using the default origins',
    });
    corsOrigins = DEFAULT_CORS_ORIGINS;
  }
  return {
    secureCookies: r.must('SECURE_COOKIES'),
    registrationMode: r.must('QRO_REGISTRATION_MODE'),
    trustedProxies: r.get('TRUSTED_PROXIES') ?? null,
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : DEFAULT_CORS_ORIGINS,
    frontendOrigin: r.get('FRONTEND_ORIGIN') ?? null,
  };
}

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const DEFAULT_POSTGRES_PORT = 5432;

type RoleSettings = {
  urlNames: readonly SettingName[];
  userName: SettingName;
  passwordFileName: SettingName;
};

const ROLES = {
  runtime: {
    urlNames: ['APP_DATABASE_URL', 'DATABASE_URL'],
    userName: 'POSTGRES_APP_USER',
    passwordFileName: 'POSTGRES_APP_PASSWORD_FILE',
  },
  admin: {
    urlNames: ['ADMIN_DATABASE_URL', 'DATABASE_URL'],
    userName: 'POSTGRES_ADMIN_USER',
    passwordFileName: 'POSTGRES_ADMIN_PASSWORD_FILE',
  },
} as const satisfies Record<string, RoleSettings>;

function parsePostgresUrl(r: Reader, name: SettingName): DatabaseRole | undefined {
  const raw = r.raw(name)!;
  const url = URL.canParse(raw) ? new URL(raw) : null;
  if (!url || !POSTGRES_PROTOCOLS.has(url.protocol)) {
    r.fail(name, 'must be a postgres:// URL');
    return undefined;
  }
  const password = decodeURIComponent(url.password);
  return {
    source: 'url',
    user: decodeURIComponent(url.username),
    password: new Secret(password),
    host: url.hostname,
    port: url.port ? Number(url.port) : DEFAULT_POSTGRES_PORT,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
    url: new Secret(raw),
  };
}

function buildRoleFromSettings(r: Reader, role: RoleSettings): DatabaseRole | undefined {
  const host = r.get('POSTGRES_HOST');
  if (host === undefined && r.raw('POSTGRES_HOST') === undefined) {
    r.fail('POSTGRES_HOST', 'required, and there is no default (set DATABASE_URL for development)');
  }
  const port = r.must('POSTGRES_PORT');
  const database = r.must('POSTGRES_DB');
  const user = r.must(role.userName as 'POSTGRES_APP_USER');
  const sslmode = r.get('POSTGRES_SSLMODE');
  const password = r.needSecretFile(role.passwordFileName);
  if (host === undefined || password === undefined) return undefined;

  const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const query = sslmode ? `?sslmode=${sslmode}` : '';
  const encode = encodeURIComponent;
  const url = `postgres://${encode(user)}:${encode(password.reveal())}@${hostPart}:${port}/${encode(database)}${query}`;
  return { source: 'settings', user, password, host, port, database, url: new Secret(url) };
}

function buildRole(r: Reader, role: RoleSettings): DatabaseRole | undefined {
  const urlName = role.urlNames.find((name) => r.raw(name) !== undefined);
  return urlName ? parsePostgresUrl(r, urlName) : buildRoleFromSettings(r, role);
}

function isPostgresUrl(value: string): boolean {
  return URL.canParse(value) && POSTGRES_PROTOCOLS.has(new URL(value).protocol);
}

function buildAdminDatabase(r: Reader): AdminDatabase | undefined {
  const role = buildRole(r, ROLES.admin);
  const bootstrap = r.raw('BOOTSTRAP_DATABASE_URL');
  if (bootstrap !== undefined && !isPostgresUrl(bootstrap)) {
    r.fail('BOOTSTRAP_DATABASE_URL', 'must be a postgres:// URL');
  }
  if (!role) return undefined;
  return { ...role, bootstrapUrl: bootstrap ? new Secret(bootstrap) : role.url };
}

function presentSettings(r: Reader, names: readonly SettingName[]): Set<SettingName> {
  return new Set(names.filter((name) => r.isSet(name)));
}

/**
 * The selected driver. An unset QRO_DOCUMENT_STORAGE means `filesystem`, unless settings show the
 * install used S3: then nothing is guessed and the setting is reported as required.
 */
function readDocumentDriver(r: Reader): DocumentStorageDriver | undefined {
  if (r.raw('QRO_DOCUMENT_STORAGE') === undefined) {
    const signals = S3_SELECTION_SIGNALS.filter((name) => r.hasValue(name));
    if (signals.length > 0) {
      const verb = signals.length === 1 ? 'is' : 'are';
      r.fail(
        'QRO_DOCUMENT_STORAGE',
        `required because ${signals.join(', ')} ${verb} set: use s3 to keep the existing store, or filesystem once \`quro documents migrate-from-s3\` has copied its documents`,
      );
      return undefined;
    }
  }
  return r.get('QRO_DOCUMENT_STORAGE');
}

function buildDocumentStorage(r: Reader): DocumentStorageConfig | undefined {
  const driver = readDocumentDriver(r);
  const directory = r.get('QRO_DOCUMENTS_DIR');
  if (driver === undefined || directory === undefined) return undefined;
  return { driver, directory };
}

/**
 * The S3 settings. `null` when none is present and the store is not selected; otherwise every
 * setting is required, and a missing one is recorded as a problem.
 */
function buildS3Connection(r: Reader, selected: boolean): S3Connection | null | undefined {
  if (!selected && !r.featureConfigured('s3Storage')) return null;
  const secretAccessKey = r.needSecretFile('S3_SECRET_ACCESS_KEY_FILE');
  const present = presentSettings(r, FEATURES.s3Storage.requires);
  if (secretAccessKey !== undefined) present.add('S3_SECRET_ACCESS_KEY_FILE');
  const settings = {
    endpoint: r.get('S3_ENDPOINT'),
    region: r.get('S3_REGION'),
    bucket: r.get('S3_BUCKET'),
    accessKeyId: r.get('S3_ACCESS_KEY_ID'),
  };
  if (!r.requireFeatureSettings('s3Storage', present)) return undefined;
  return {
    endpoint: settings.endpoint!,
    region: settings.region!,
    bucket: settings.bucket!,
    accessKeyId: settings.accessKeyId!,
    secretAccessKey: secretAccessKey!,
    forcePathStyle: r.must('S3_FORCE_PATH_STYLE'),
  };
}

function buildDocuments(r: Reader): DocumentsConfig | undefined {
  const driver = readDocumentDriver(r);
  if (driver === 'filesystem') {
    const directory = r.get('QRO_DOCUMENTS_DIR');
    return directory === undefined ? undefined : { driver, directory };
  }
  if (driver === 's3') {
    // With the S3 driver the filesystem directory is not used, so the server never reads it.
    const s3 = buildS3Connection(r, true);
    return s3 ? { driver, s3 } : undefined;
  }
  return undefined;
}

function buildS3Source(r: Reader): S3SourceConfig | undefined {
  const s3 = buildS3Connection(r, false);
  if (s3 === null) return { enabled: false };
  return s3 && { enabled: true, ...s3 };
}

function buildBunq(r: Reader): BunqConfig {
  if (!r.featureConfigured('bunq')) return { enabled: false };
  const clientId = r.secretValueOrFile('BUNQ_CLIENT_ID', 'BUNQ_CLIENT_ID_FILE');
  const clientSecret = r.secretValueOrFile('BUNQ_CLIENT_SECRET', 'BUNQ_CLIENT_SECRET_FILE');
  const redirectUri = r.get('BUNQ_REDIRECT_URI');
  const frontendOrigin = r.get('FRONTEND_ORIGIN');
  const present = new Set<SettingName>();
  if (clientId) present.add('BUNQ_CLIENT_ID');
  if (clientSecret) present.add('BUNQ_CLIENT_SECRET');
  if (redirectUri) present.add('BUNQ_REDIRECT_URI');
  if (frontendOrigin) present.add('FRONTEND_ORIGIN');
  if (!r.requireFeatureSettings('bunq', present)) return { enabled: false };
  return {
    enabled: true,
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    frontendOrigin: frontendOrigin!,
    sandbox: r.must('BUNQ_SANDBOX'),
  };
}

function buildPensionImport(r: Reader): PensionImportConfig {
  return {
    parserUrl: r.get('PENSION_PARSER_URL') ?? null,
    parserTimeoutMs: r.must('PENSION_PARSER_TIMEOUT_MS'),
    draftTtlDays: r.must('IMPORT_DRAFT_TTL_DAYS'),
    workerPollIntervalMs: r.must('IMPORT_WORKER_POLL_INTERVAL_MS'),
  };
}

function tracesUrlFor(endpoint: string | undefined, tracesEndpoint: string | undefined) {
  if (tracesEndpoint) return tracesEndpoint;
  return endpoint ? `${endpoint.replace(/\/+$/, '')}/v1/traces` : null;
}

function buildTracing(r: Reader): TracingConfig {
  const tracesUrl = tracesUrlFor(
    r.get('OTEL_EXPORTER_OTLP_ENDPOINT'),
    r.get('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'),
  );
  return {
    enabled: tracesUrl !== null && !r.must('OTEL_SDK_DISABLED'),
    tracesUrl,
    serviceName: r.must('OTEL_SERVICE_NAME'),
  };
}

function buildTools(r: Reader): ToolsConfig {
  return {
    pgDump: r.get('QRO_PG_DUMP_BIN') ?? null,
    pgRestore: r.get('QRO_PG_RESTORE_BIN') ?? null,
    psql: r.get('QRO_PSQL_BIN') ?? null,
  };
}

function buildMaintenance(r: Reader): MaintenanceConfig {
  return {
    restoreConfirm: r.get('QRO_RESTORE_CONFIRM') ?? null,
    restoreAllowNonEmpty: r.get('QRO_RESTORE_ALLOW_NON_EMPTY') === '1',
    clearConfirm: r.get('QRO_CLEAR_CONFIRM') ?? null,
    clearAllowNonEmpty: r.get('QRO_CLEAR_ALLOW_NON_EMPTY') === '1',
  };
}

/** A short key would make the encryption only as strong as a guessable password. */
export const MIN_BACKUP_KEY_LENGTH = 32;

function readBackupKey(r: Reader): Secret | null | undefined {
  if (!r.isSet('QRO_BACKUP_ENCRYPTION_KEY_FILE')) return null;
  const key = r.needSecretFile('QRO_BACKUP_ENCRYPTION_KEY_FILE');
  if (key && key.reveal().length < MIN_BACKUP_KEY_LENGTH) {
    r.fail(
      'QRO_BACKUP_ENCRYPTION_KEY_FILE',
      `the key in the file must be at least ${MIN_BACKUP_KEY_LENGTH} characters long`,
    );
    return undefined;
  }
  return key;
}

function buildBackup(r: Reader): BackupConfig | undefined {
  const directory = r.get('QRO_BACKUP_DIR');
  const offsiteDirectory = r.get('QRO_BACKUP_OFFSITE_DIR') ?? null;
  const keep = r.get('QRO_BACKUP_KEEP') ?? null;
  const encryptionKey = readBackupKey(r);
  if (offsiteDirectory !== null && !r.isSet('QRO_BACKUP_ENCRYPTION_KEY_FILE')) {
    r.fail(
      'QRO_BACKUP_OFFSITE_DIR',
      'needs QRO_BACKUP_ENCRYPTION_KEY_FILE: copies that leave this machine are always encrypted',
    );
  }
  if (offsiteDirectory !== null && offsiteDirectory === directory) {
    r.fail('QRO_BACKUP_OFFSITE_DIR', 'must be a different directory from QRO_BACKUP_DIR');
  }
  if (directory === undefined || encryptionKey === undefined) return undefined;
  return { directory, encryptionKey, offsiteDirectory, keep };
}

function buildDemo(r: Reader): DemoConfig {
  const password = r.get('DEMO_USER_PASSWORD');
  return { userPassword: password === undefined ? null : new Secret(password) };
}

// A builder may return undefined once it has recorded a problem; the value is then never used.
type SectionBuilders = {
  [K in SectionName]: (r: Reader, notices: ConfigNotice[]) => Config[K] | undefined;
};

const BUILDERS: SectionBuilders = {
  runtime: buildRuntime,
  web: buildWeb,
  runtimeDatabase: (r) => buildRole(r, ROLES.runtime),
  adminDatabase: buildAdminDatabase,
  documentStorage: buildDocumentStorage,
  documents: buildDocuments,
  s3: buildS3Source,
  bunq: buildBunq,
  pensionImport: buildPensionImport,
  tracing: buildTracing,
  tools: buildTools,
  maintenance: buildMaintenance,
  backup: buildBackup,
  demo: buildDemo,
};

export const SECTION_NAMES = Object.keys(BUILDERS) as SectionName[];

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const plain = Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype;
  if (!plain) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function findRetired(env: Environment): ConfigNotice[] {
  return Object.entries(RETIRED_SETTINGS)
    .filter(([name]) => env[name]?.trim())
    .map(([name, replacement]) => ({
      setting: name,
      message: `is no longer read; use ${replacement}`,
    }));
}

type Built = { value: unknown; problems: readonly ConfigProblem[] };

/**
 * Parses the environment and the secret files it points at. Pure apart from reading those files:
 * it does not touch `process.env`, so tests pass their own environment.
 *
 * Sections are built the first time they are read, so a process never opens the secret files of
 * a section it does not use (the server does not load the owner role's password).
 */
export function loadConfig(
  env: Environment,
  readFile: ReadFile = (path) => readFileSync(path, 'utf8'),
): LoadedConfig {
  const retired = findRetired(env);
  const observed: ConfigNotice[] = [];
  const built = new Map<SectionName, Built>();

  const build = (name: SectionName): Built => {
    let result = built.get(name);
    if (!result) {
      const reader = new Reader(env, readFile);
      const value = BUILDERS[name](reader, observed);
      result = {
        value: reader.problems.length > 0 ? undefined : deepFreeze(value),
        problems: reader.problems,
      };
      built.set(name, result);
    }
    return result;
  };

  const config = {} as Record<string, unknown>;
  const problems = {} as Record<SectionName, readonly ConfigProblem[]>;
  for (const name of SECTION_NAMES) {
    Object.defineProperty(problems, name, { enumerable: true, get: () => build(name).problems });
    Object.defineProperty(config, name, {
      enumerable: true,
      get() {
        const { value, problems: sectionProblems } = build(name);
        if (sectionProblems.length > 0) throw new ConfigError(sectionProblems);
        return value;
      },
    });
  }
  Object.defineProperty(config, 'notices', {
    enumerable: true,
    get: () => {
      build('web');
      return deepFreeze([...retired, ...observed]);
    },
  });

  return { config: Object.freeze(config) as Config, problems: Object.freeze(problems) };
}
