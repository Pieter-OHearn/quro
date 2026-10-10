import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { postgresMajorProblem, runtimeProblems } from '../lib/platformSupport';
import { classifyDatabaseError, describeDatabaseError } from './connectionErrors';
import {
  applyRuntimeRolePlan,
  describeRuntimeRolePlan,
  planRuntimeRole,
  readOwnerFacts,
  type OwnerFacts,
  type RuntimeRolePlan,
  type SignInCheck,
} from './runtimeRole';
import { compareSchema, describeSchema, readLatestAppliedWhen } from './schemaVersion';

// `quro migrate`: checks first, then applies pending migrations and the runtime role under a
// database lock. Every check runs before the first change, so a refusal leaves the database as
// it was. The migrator applies all pending migrations in one transaction: an interrupted run
// applies none of them, and the next run starts again from the same point.

export const DEFAULT_MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

/**
 * Session-level advisory lock that serialises `quro migrate` runs against one database. The two
 * keys are `quro` in ASCII and 1 for "migrate". PostgreSQL releases it when the session ends, so
 * a killed run never leaves it behind.
 */
export const MIGRATION_LOCK = { classId: 0x7175726f, objectId: 1 } as const;

export type MigrateOutcome =
  | { kind: 'ok' }
  | { kind: 'refused'; message: string }
  | { kind: 'unreachable'; message: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'failed'; message: string };

export type MigrateOptions = {
  adminUrl: string;
  /** Where the owner connects, for messages: never includes the password. */
  target: { host: string; port: number; database: string; user: string };
  /** The runtime role to prepare; null to apply schema migrations only (`db:migrate`). */
  runtime: { user: string; url: string; password: string } | null;
  dryRun: boolean;
  print: (line: string) => void;
  migrationsFolder?: string;
  connectAttempts?: number;
  retryDelayMs?: number;
  signIn?: SignInCheck;
};

type AdminSql = Sql<Record<string, unknown>>;

const DEFAULT_CONNECT_ATTEMPTS = 30;
const DEFAULT_RETRY_DELAY_MS = 1000;
const CONNECT_TIMEOUT_SECONDS = 10;
const CLOSE_TIMEOUT_SECONDS = 5;
const INSUFFICIENT_PRIVILEGE = '42501';

const LISTED_TAGS = 5;

/** Migration names for output; a long list shows its first and last entries. */
export function formatMigrations(tags: readonly string[]): string {
  if (tags.length <= LISTED_TAGS) return tags.join(', ');
  return `${tags[0]} to ${tags.at(-1)}`;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function connect(options: MigrateOptions): Promise<AdminSql> {
  const attempts = options.connectAttempts ?? DEFAULT_CONNECT_ATTEMPTS;
  for (let attempt = 1; ; attempt += 1) {
    // One connection: the advisory lock and the migrations share a session.
    const sql = postgres(options.adminUrl, {
      max: 1,
      connect_timeout: CONNECT_TIMEOUT_SECONDS,
      onnotice: () => undefined,
    });
    try {
      await sql`select 1`;
      return sql as unknown as AdminSql;
    } catch (error) {
      await sql.end({ timeout: CLOSE_TIMEOUT_SECONDS }).catch(() => undefined);
      if (classifyDatabaseError(error) !== 'unreachable' || attempt >= attempts) throw error;
      if (attempt === 1) options.print('Waiting for the database to accept connections...');
      await sleep(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    }
  }
}

type Preflight = { owner: OwnerFacts; plan: RuntimeRolePlan | null; pending: string[] };

function ownerProblem(owner: OwnerFacts): string | null {
  const versionProblem = postgresMajorProblem(owner.serverMajor);
  if (versionProblem) return versionProblem;
  if (owner.superuser || owner.ownsDatabase) return null;
  return `The owner role ${owner.owner} does not own the database ${owner.database}. Make it the owner (ALTER DATABASE ${owner.database} OWNER TO ${owner.owner}) or set POSTGRES_ADMIN_USER to the role that owns it.`;
}

/** Reads everything the run depends on and refuses before any change. */
async function preflight(
  sql: AdminSql,
  options: MigrateOptions,
): Promise<Preflight | MigrateOutcome> {
  const owner = await readOwnerFacts(sql);
  options.print(
    `Database: ${options.target.host}:${options.target.port}/${owner.database} as ${owner.owner} (PostgreSQL ${owner.serverVersion}).`,
  );
  const problem = ownerProblem(owner);
  if (problem) return { kind: 'refused', message: problem };

  const schema = compareSchema(await readLatestAppliedWhen(sql));
  if (schema.status === 'ahead' || schema.status === 'unknown') {
    return { kind: 'refused', message: describeSchema(schema) };
  }
  const pending = schema.status === 'current' ? [] : schema.pending.map((m) => m.tag);
  options.print(
    pending.length === 0
      ? `Schema: up to date (${schema.status === 'current' ? schema.latest.tag : 'none'}).`
      : `Schema: ${pending.length} pending migration(s): ${formatMigrations(pending)}.`,
  );

  if (!options.runtime) return { owner, plan: null, pending };
  const plan = await planRuntimeRole(sql, owner, options.runtime, options.signIn);
  options.print(describeRuntimeRolePlan(plan, options.runtime.user));
  if (plan.action === 'refuse') return { kind: 'refused', message: plan.reason };
  return { owner, plan, pending };
}

async function takeLock(sql: AdminSql, print: (line: string) => void) {
  const { classId, objectId } = MIGRATION_LOCK;
  const [row] = await sql<{ locked: boolean }[]>`
    select pg_try_advisory_lock(${classId}, ${objectId}) as "locked"
  `;
  if (row?.locked) return;
  print('Another `quro migrate` is running against this database; waiting for it to finish...');
  await sql`select pg_advisory_lock(${classId}, ${objectId})`;
}

async function applyChanges(sql: AdminSql, options: MigrateOptions): Promise<MigrateOutcome> {
  await takeLock(sql, options.print);
  // Read again under the lock: a run that held it may have done the work already.
  const checked = await preflight(sql, { ...options, print: () => undefined });
  if ('kind' in checked) return checked;

  if (checked.pending.length > 0) {
    await migrate(drizzle(sql), {
      migrationsFolder: options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER,
    });
    options.print(
      `Applied ${checked.pending.length} migration(s): ${formatMigrations(checked.pending)}.`,
    );
  } else {
    options.print('No migrations to apply.');
  }

  if (options.runtime && checked.plan && checked.plan.action !== 'refuse') {
    try {
      const changes = await applyRuntimeRolePlan(sql, checked.plan, {
        roleName: options.runtime.user,
        password: options.runtime.password,
      });
      for (const change of changes) options.print(change);
    } catch (error) {
      throw new RuntimeRoleStepError(error);
    }
  }
  return { kind: 'ok' };
}

/** A failure after the migrations were committed, while preparing the runtime role. */
class RuntimeRoleStepError extends Error {
  constructor(readonly original: unknown) {
    super('runtime role step failed');
  }
}

function outcomeForError(caught: unknown): MigrateOutcome {
  const roleStep = caught instanceof RuntimeRoleStepError;
  const error = roleStep ? caught.original : caught;
  const reason = describeDatabaseError(error);
  switch (classifyDatabaseError(error)) {
    case 'unreachable':
      return { kind: 'unreachable', message: `The database cannot be reached: ${reason}.` };
    case 'rejected':
      return { kind: 'rejected', message: `The database refused the connection: ${reason}.` };
    default:
      break;
  }
  if ((error as { code?: unknown }).code === INSUFFICIENT_PRIVILEGE) {
    return { kind: 'refused', message: `Missing database privileges: ${reason}.` };
  }
  if (roleStep) {
    return {
      kind: 'failed',
      message: `The schema is migrated, but preparing the runtime role failed: ${reason}. Fix the cause and run \`quro migrate\` again.`,
    };
  }
  return {
    kind: 'failed',
    message: `Migration failed: ${reason}. Pending migrations run in one transaction, so none from this run was recorded; fix the cause and run \`quro migrate\` again.`,
  };
}

/** Runs `quro migrate` (or its `--dry-run`) and reports how it ended. */
export async function migrateDatabase(options: MigrateOptions): Promise<MigrateOutcome> {
  const problems = runtimeProblems();
  if (problems.length > 0) return { kind: 'refused', message: problems.join(' ') };

  let sql: AdminSql | undefined;
  try {
    sql = await connect(options);
    const checked = await preflight(sql, options);
    if ('kind' in checked) return checked;
    if (options.dryRun) {
      options.print('Dry run: nothing was changed.');
      return { kind: 'ok' };
    }
    return await applyChanges(sql, options);
  } catch (error) {
    return outcomeForError(error);
  } finally {
    // Ending the session releases the advisory lock.
    await sql?.end({ timeout: CLOSE_TIMEOUT_SECONDS }).catch(() => undefined);
  }
}
