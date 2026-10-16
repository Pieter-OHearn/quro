import postgres, { type Sql } from 'postgres';
import { ConfigError, getConfig, profileProblems, type DatabaseRole } from '../config';
import { classifyDatabaseError, describeDatabaseError } from '../db/connectionErrors';
import { readInstalledToolMajor } from '../db/pgTools';
import { readOwnerFacts, type OwnerFacts } from '../db/runtimeRole';
import { compareSchema, describeSchema, readLatestAppliedWhen } from '../db/schemaVersion';
import { getBuildInfo, type BuildInfo } from '../lib/buildInfo';
import { REFERENCES_SQL } from '../backup/createBackup';
import { createDocumentStore } from '../lib/documentStorage';
import { summarizeSecrets, type SecretRow, type SecretsReport } from '../lib/integrationSecrets';
import {
  classifyBackup,
  classifyDisk,
  classifyDocuments,
  classifyFreshness,
  classifyJob,
  countMissingDocuments,
  FRESHNESS_SQL,
  JOB_INTERVAL_MS,
  JOB_ROWS_SQL,
  newestBackup,
  readDiskFacts,
  type Finding,
  type FreshnessFacts,
  type JobExpectation,
  type JobRow,
} from '../lib/operationalStatus';
import { postgresMajorProblem, runtimeProblems } from '../lib/platformSupport';
import {
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_REFUSED,
  EXIT_UNAVAILABLE,
  EXIT_USAGE,
  UsageError,
  type CommandIo,
} from './io';

// `quro doctor`: read-only checks of everything an install depends on. It opens connections and
// reads files, and changes nothing: no migration, no role, no document. Messages name settings,
// hosts, roles and paths, never a secret value or a connection string.

export const DOCTOR_USAGE = `Usage: quro doctor [--json]

Read-only checks: host and runtime, settings, both database roles, the schema against this
image, the backup tool version, the document store, the encryption of stored bank-link
secrets, background jobs, data freshness, disk space, the age of the newest backup and whether
the documents the database refers to are in the store. Changes nothing. A job, sync or backup
with no record is reported as unknown, never as healthy.

Options:
  --json   Print one JSON report instead of text

Exit codes: 0 every check passed (warnings allowed), 1 a check failed, 2 invalid settings,
3 refused by a safety check (unsupported database, schema newer than this image),
4 database or document store unreachable.`;

/** `unknown`: nothing proves the thing is healthy or not (no recorded run, no backup found). */
export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip' | 'unknown';

/** Which exit code a failed check leads to. */
export type FailureKind = 'settings' | 'unreachable' | 'refused' | 'failed';

export type DoctorCheck = {
  id: string;
  status: CheckStatus;
  message: string;
  failure?: FailureKind;
};

export type DoctorReport = {
  status: 'ok' | 'fail';
  exitCode: number;
  build: BuildInfo;
  checks: DoctorCheck[];
};

const STATUS_WIDTH = 'UNKNOWN'.length;
const CONNECT_TIMEOUT_SECONDS = 5;
const CLOSE_TIMEOUT_SECONDS = 5;

const ok = (id: string, message: string): DoctorCheck => ({ id, status: 'ok', message });
const warn = (id: string, message: string): DoctorCheck => ({ id, status: 'warn', message });
const fromFinding = (finding: Finding): DoctorCheck => {
  if (finding.health === 'fail') return fail(finding.id, 'failed', finding.message);
  return { id: finding.id, status: finding.health, message: finding.message };
};
const skip = (id: string, message: string): DoctorCheck => ({ id, status: 'skip', message });
const fail = (id: string, failure: FailureKind, message: string): DoctorCheck => ({
  id,
  status: 'fail',
  failure,
  message,
});

function runtimeCheck(build: BuildInfo): DoctorCheck {
  const problems = runtimeProblems();
  if (problems.length > 0) return fail('runtime', 'refused', problems.join(' '));
  const uid = process.getuid?.() ?? 'unknown';
  const { platform, arch, bun } = build.runtime;
  return ok('runtime', `${platform} ${arch}, Bun ${bun}, running as UID ${uid}.`);
}

function settingsChecks(): DoctorCheck[] {
  const problems = profileProblems('doctor');
  const checks = problems.map(({ setting, message }) =>
    fail(`settings.${setting}`, 'settings', `${setting}: ${message}`),
  );
  for (const notice of getConfig().notices) {
    checks.push(warn(`settings.${notice.setting}`, `${notice.setting} ${notice.message}`));
  }
  if (problems.length === 0) checks.unshift(ok('settings', 'Settings are valid.'));
  return checks;
}

/** A section of the configuration, or null when it is invalid (already reported). */
function section<T>(read: () => T): T | null {
  try {
    return read();
  } catch (error) {
    if (error instanceof ConfigError) return null;
    throw error;
  }
}

type AnySql = Sql<Record<string, unknown>>;

async function withConnection<T>(role: DatabaseRole, work: (sql: AnySql) => Promise<T>) {
  const sql = postgres(role.url.reveal(), {
    max: 1,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    onnotice: () => undefined,
  });
  try {
    return await work(sql as unknown as AnySql);
  } finally {
    await sql.end({ timeout: CLOSE_TIMEOUT_SECONDS }).catch(() => undefined);
  }
}

function connectionFailure(id: string, role: DatabaseRole, error: unknown): DoctorCheck {
  const where = `${role.user}@${role.host}:${role.port}/${role.database}`;
  const reason = describeDatabaseError(error);
  const kind = classifyDatabaseError(error);
  if (kind === 'unreachable') return fail(id, 'unreachable', `${where}: ${reason}.`);
  if (kind === 'rejected') return fail(id, 'settings', `${where}: ${reason}.`);
  return fail(id, 'failed', `${where}: ${reason}.`);
}

function ownerChecks(owner: OwnerFacts, latestApplied: number | null): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const versionProblem = postgresMajorProblem(owner.serverMajor);
  checks.push(
    versionProblem
      ? fail('database.version', 'refused', versionProblem)
      : ok('database.version', `PostgreSQL ${owner.serverVersion}.`),
  );
  checks.push(
    owner.superuser || owner.ownsDatabase
      ? ok(
          'database.owner',
          `${owner.owner} owns ${owner.database}${owner.createRole || owner.superuser ? ' and can create roles' : ''}.`,
        )
      : fail(
          'database.owner',
          'refused',
          `${owner.owner} does not own the database ${owner.database}.`,
        ),
  );
  const schema = compareSchema(latestApplied);
  const message = describeSchema(schema);
  if (schema.status === 'current') checks.push(ok('database.schema', message));
  else if (schema.status === 'ahead' || schema.status === 'unknown') {
    checks.push(fail('database.schema', 'refused', message));
  } else checks.push(fail('database.schema', 'failed', message));
  return checks;
}

async function ownerRoleChecks(): Promise<{ checks: DoctorCheck[]; serverMajor: number | null }> {
  const admin = section(() => getConfig().adminDatabase);
  if (!admin) {
    return {
      checks: [skip('database.admin', 'Not checked: invalid settings.')],
      serverMajor: null,
    };
  }
  try {
    return await withConnection(admin, async (sql) => {
      const owner = await readOwnerFacts(sql);
      const latest = await readLatestAppliedWhen(sql);
      const checks = [
        ok(
          'database.admin',
          `${admin.user} signs in to ${admin.host}:${admin.port}/${admin.database}.`,
        ),
      ];
      return { checks: [...checks, ...ownerChecks(owner, latest)], serverMajor: owner.serverMajor };
    });
  } catch (error) {
    return { checks: [connectionFailure('database.admin', admin, error)], serverMajor: null };
  }
}

async function runtimeRoleCheck(): Promise<DoctorCheck> {
  const runtime = section(() => getConfig().runtimeDatabase);
  if (!runtime) return skip('database.runtime', 'Not checked: invalid settings.');
  try {
    await withConnection(runtime, (sql) => sql`select 1`);
    return ok('database.runtime', `${runtime.user} signs in.`);
  } catch (error) {
    const check = connectionFailure('database.runtime', runtime, error);
    if (classifyDatabaseError(error) !== 'rejected') return check;
    // Before the first `quro migrate` the runtime role does not exist yet.
    return fail(
      'database.runtime',
      'failed',
      `${check.message} Run \`quro migrate\` to create or update it.`,
    );
  }
}

async function backupToolCheck(serverMajor: number | null): Promise<DoctorCheck> {
  let toolMajor: number;
  try {
    toolMajor = await readInstalledToolMajor('pg_dump');
  } catch {
    return warn(
      'backup.tools',
      'pg_dump is not available here; backups run from the backend image.',
    );
  }
  if (serverMajor === null)
    return skip('backup.tools', `pg_dump ${toolMajor}; server version unknown.`);
  if (toolMajor >= serverMajor)
    return ok('backup.tools', `pg_dump ${toolMajor} covers PostgreSQL ${serverMajor}.`);
  return fail(
    'backup.tools',
    'failed',
    `pg_dump ${toolMajor} is older than PostgreSQL ${serverMajor}; backups would fail.`,
  );
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/** A rejected key is a settings problem, a missing bucket a failed check, the rest the network. */
export function s3FailureKind(error: unknown): FailureKind {
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return 'settings';
  if (status === HTTP_NOT_FOUND) return 'failed';
  return 'unreachable';
}

const S3_HINTS: Partial<Record<FailureKind, string>> = {
  settings: ' The store rejected the access key; check S3_ACCESS_KEY_ID and the secret key file.',
  failed: ' The bucket does not exist; create it first.',
};

async function documentStoreCheck(): Promise<DoctorCheck> {
  const documents = section(() => getConfig().documents);
  if (!documents) return skip('documents', 'Not checked: invalid settings.');
  const where =
    documents.driver === 'filesystem'
      ? documents.directory
      : `S3 bucket ${documents.s3.bucket} at ${documents.s3.endpoint}`;
  try {
    await createDocumentStore(documents).check();
    return ok('documents', `${documents.driver}: ${where} is usable.`);
  } catch (error) {
    if (documents.driver === 's3') {
      const failure = s3FailureKind(error);
      return fail('documents', failure, `s3: ${where} is not usable.${S3_HINTS[failure] ?? ''}`);
    }
    const reason = error instanceof Error ? ` ${error.message}` : '';
    return fail('documents', 'failed', `filesystem: ${where} is not usable.${reason}`);
  }
}

const UNDEFINED_TABLE = '42P01';

function readSecretRowsWith(sql: AnySql): Promise<SecretRow[]> {
  return sql<SecretRow[]>`
    select id, user_id as "userId", access_token as "accessToken", private_key as "privateKey",
      installation_token as "installationToken", session_token as "sessionToken"
    from bunq_connections order by id
  `;
}

/** Whether stored bank-link secrets are encrypted with the configured key. Prints counts only. */
async function integrationSecretsCheck(): Promise<DoctorCheck> {
  const runtime = section(() => getConfig().runtimeDatabase);
  const secrets = section(() => getConfig().secrets);
  if (!runtime || !secrets) return skip('secrets', 'Not checked: invalid settings.');
  let rows: SecretRow[];
  try {
    rows = await withConnection(runtime, readSecretRowsWith);
  } catch (error) {
    if ((error as { code?: unknown }).code === UNDEFINED_TABLE) {
      return skip('secrets', 'Not checked: the schema is not migrated yet.');
    }
    return skip('secrets', 'Not checked: the runtime role cannot read the database.');
  }
  return secretsCheckFor(
    summarizeSecrets(rows, { current: secrets.key, previous: secrets.previousKey }),
    secrets.key?.id ?? null,
  );
}

function secretsCheckFor(report: SecretsReport, keyId: string | null): DoctorCheck {
  const keyText = keyId ? `key ${keyId}` : 'no secrets key configured';
  const { secrets: counts } = report;
  switch (report.status) {
    case 'none':
      return ok('secrets', `No bank-link secrets are stored (${keyText}).`);
    case 'current':
      return ok('secrets', `${counts.total} bank-link secret(s), all encrypted with ${keyText}.`);
    case 'rotation_pending':
      return warn(
        'secrets',
        `${counts.previous} of ${counts.total} bank-link secret(s) are encrypted with the previous key. Run \`quro secrets rotate\`.`,
      );
    case 'unencrypted':
      return warn(
        'secrets',
        `${counts.unencrypted} of ${counts.total} bank-link secret(s) are stored unencrypted. ${keyId ? 'Run `quro secrets encrypt`.' : 'Set QRO_SECRETS_KEY_FILE, then run `quro secrets encrypt`.'}`,
      );
    default:
      // This container has no key, so it cannot tell a wrong key from a missing one: the server's
      // own settings check decides whether bunq can run.
      if (!keyId && counts.unreadable === 0) {
        return warn(
          'secrets',
          `${counts.unknownKey} bank-link secret(s) are encrypted with key ${report.unknownKeyIds.join(', ')}, and no secrets key is configured here, so they were not checked. Mount the key file to check them.`,
        );
      }
      return fail(
        'secrets',
        'failed',
        `${counts.unknownKey + counts.unreadable} of ${counts.total} bank-link secret(s) cannot be opened with ${keyText} (users ${report.reconnectUserIds.join(', ')}). Configure the key they were encrypted with, or have those users connect bunq again. \`quro secrets status\` shows the details.`,
      );
  }
}

const BACKUP_AGE_UNREADABLE = ['ENOENT', 'EACCES', 'ENOTDIR', 'EPERM'];
const SESSION_CLEANUP_FALLBACK_MS = 60 * 60 * 1000;

async function withRuntime<T>(work: (sql: AnySql) => Promise<T>): Promise<T | null | undefined> {
  const runtime = section(() => getConfig().runtimeDatabase);
  if (!runtime) return null;
  try {
    return await withConnection(runtime, work);
  } catch {
    return undefined;
  }
}

/** Background jobs and data freshness, from records the server leaves in the database. */
async function jobAndFreshnessChecks(now: Date): Promise<DoctorCheck[]> {
  const read = await withRuntime(async (sql) => ({
    jobs: await sql.unsafe<JobRow[]>(JOB_ROWS_SQL),
    freshness: (await sql.unsafe<FreshnessFacts[]>(FRESHNESS_SQL))[0]!,
  }));
  if (!read) return [skip('jobs', 'Not checked: the database or the schema is not ready.')];
  const bunq = section(() => getConfig().bunq);
  const sessionMs = section(() => getConfig().runtime.sessionCleanupIntervalMs);
  const expectations: JobExpectation[] = [
    { name: 'session-cleanup', intervalMs: sessionMs ?? SESSION_CLEANUP_FALLBACK_MS, core: true },
    { name: 'holding-price-sync', intervalMs: JOB_INTERVAL_MS['holding-price-sync'], core: true },
    { name: 'currency-rate-sync', intervalMs: JOB_INTERVAL_MS['currency-rate-sync'], core: true },
    { name: 'net-worth-snapshot', intervalMs: JOB_INTERVAL_MS['net-worth-snapshot'], core: true },
    ...(bunq?.enabled
      ? [{ name: 'bunq-sync', intervalMs: JOB_INTERVAL_MS['bunq-sync'], core: false }]
      : []),
  ];
  return [
    ...expectations.map((job) => fromFinding(classifyJob(job, read.jobs, now))),
    ...classifyFreshness(read.freshness, now).map(fromFinding),
  ];
}

/** Disk space of the document directory, and the age of the newest backup. */
async function storageChecks(now: Date): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const documents = section(() => getConfig().documents);
  if (documents?.driver === 'filesystem') {
    try {
      checks.push(
        fromFinding(
          classifyDisk(
            'disk.documents',
            'Document directory',
            await readDiskFacts(documents.directory),
          ),
        ),
      );
    } catch {
      checks.push(skip('disk.documents', 'Not checked: the document directory cannot be read.'));
    }
  }
  const backup = section(() => getConfig().backup);
  if (backup) {
    let newest: Date | null = null;
    let reachable = true;
    try {
      newest = await newestBackup(backup.directory);
    } catch (error) {
      if (!BACKUP_AGE_UNREADABLE.includes((error as { code?: string }).code ?? '')) throw error;
      reachable = false;
    }
    checks.push(fromFinding(classifyBackup(newest, now, reachable)));
    try {
      checks.push(
        fromFinding(
          classifyDisk('disk.backups', 'Backup directory', await readDiskFacts(backup.directory)),
        ),
      );
    } catch {
      // The age check already says the directory cannot be read.
    }
  }
  return checks;
}

/** That every document a row refers to is in the filesystem store (an S3 store is not listed). */
async function documentReferenceCheck(): Promise<DoctorCheck> {
  const documents = section(() => getConfig().documents);
  if (documents?.driver !== 'filesystem') {
    return skip('documents.references', 'Not checked: only the filesystem store is checked here.');
  }
  const keys = await withRuntime(async (sql) =>
    (await sql.unsafe<{ key: string }[]>(REFERENCES_SQL)).map((row) => row.key),
  );
  if (!keys)
    return skip('documents.references', 'Not checked: the database or the schema is not ready.');
  return fromFinding(classifyDocuments(await countMissingDocuments(documents.directory, keys)));
}

const EXIT_BY_FAILURE: ReadonlyArray<[FailureKind, number]> = [
  ['settings', EXIT_USAGE],
  ['unreachable', EXIT_UNAVAILABLE],
  ['refused', EXIT_REFUSED],
  ['failed', EXIT_FAILURE],
];

export function exitCodeFor(checks: readonly DoctorCheck[]): number {
  const failures = new Set(checks.map((check) => check.failure).filter(Boolean));
  return EXIT_BY_FAILURE.find(([kind]) => failures.has(kind))?.[1] ?? EXIT_OK;
}

export async function runDoctor(): Promise<DoctorReport> {
  const build = getBuildInfo();
  const owner = await ownerRoleChecks();
  const checks = [
    runtimeCheck(build),
    ...settingsChecks(),
    ...owner.checks,
    await runtimeRoleCheck(),
    await backupToolCheck(owner.serverMajor),
    await documentStoreCheck(),
    await integrationSecretsCheck(),
    ...(await jobAndFreshnessChecks(new Date())),
    ...(await storageChecks(new Date())),
    await documentReferenceCheck(),
  ];
  const exitCode = exitCodeFor(checks);
  return { status: exitCode === EXIT_OK ? 'ok' : 'fail', exitCode, build, checks };
}

function printText(report: DoctorReport, io: CommandIo) {
  const { version, revision, migrations } = report.build;
  io.out(`Quro ${version} (revision ${revision}, schema ${migrations.latest})`);
  for (const check of report.checks) {
    io.out(`${check.status.toUpperCase().padEnd(STATUS_WIDTH)}  ${check.id}: ${check.message}`);
  }
  io.out(
    report.status === 'ok'
      ? 'All checks passed.'
      : `Some checks failed (exit code ${report.exitCode}).`,
  );
}

export async function runDoctorCommand(args: readonly string[], io: CommandIo): Promise<number> {
  if (args.includes('--help')) {
    io.out(DOCTOR_USAGE);
    return EXIT_OK;
  }
  const unknown = args.find((arg) => arg !== '--json');
  if (unknown) throw new UsageError(`Unknown argument: ${unknown}`);
  const report = await runDoctor();
  if (args.includes('--json')) io.out(JSON.stringify(report, null, 2));
  else printText(report, io);
  return report.exitCode;
}
