import postgres, { type Sql } from 'postgres';
import { ConfigError, getConfig, profileProblems, type DatabaseRole } from '../config';
import { classifyDatabaseError, describeDatabaseError } from '../db/connectionErrors';
import { readInstalledToolMajor } from '../db/pgTools';
import { readOwnerFacts, type OwnerFacts } from '../db/runtimeRole';
import { compareSchema, describeSchema, readLatestAppliedWhen } from '../db/schemaVersion';
import { getBuildInfo, type BuildInfo } from '../lib/buildInfo';
import { createDocumentStore } from '../lib/documentStorage';
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

Read-only checks: host and runtime, settings (including retired ones), both database roles,
the schema against this image, the backup tool version and the document store. Changes nothing.

Options:
  --json   Print one JSON report instead of text

Exit codes: 0 every check passed (warnings allowed), 1 a check failed, 2 invalid settings,
3 refused by a safety check (unsupported database, schema newer than this image),
4 database or document store unreachable.`;

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

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

const CONNECT_TIMEOUT_SECONDS = 5;
const CLOSE_TIMEOUT_SECONDS = 5;

const ok = (id: string, message: string): DoctorCheck => ({ id, status: 'ok', message });
const warn = (id: string, message: string): DoctorCheck => ({ id, status: 'warn', message });
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
  ];
  const exitCode = exitCodeFor(checks);
  return { status: exitCode === EXIT_OK ? 'ok' : 'fail', exitCode, build, checks };
}

function printText(report: DoctorReport, io: CommandIo) {
  const { version, revision, migrations } = report.build;
  io.out(`Quro ${version} (revision ${revision}, schema ${migrations.latest})`);
  for (const check of report.checks) {
    io.out(`${check.status.toUpperCase().padEnd(4)}  ${check.id}: ${check.message}`);
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
