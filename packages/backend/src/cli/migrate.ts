import { assertConfig } from '../config';
import {
  migrateDatabase,
  readMigrationStatus,
  type MigrateOptions,
  type MigrateOutcome,
  type MigrationStatus,
} from '../db/migrateDatabase';
import {
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_REFUSED,
  EXIT_UNAVAILABLE,
  EXIT_USAGE,
  UsageError,
  type CommandIo,
} from './io';

export const MIGRATE_USAGE = `Usage: quro migrate [--dry-run]
       quro migrate --status [--json]

Applies pending schema migrations as the owner role (POSTGRES_ADMIN_USER), then creates or
updates the runtime role (POSTGRES_APP_USER) and its grants. Runs one at a time per database;
a second run waits for the first and then changes nothing.

Options:
  --dry-run   Check settings, privileges and the schema, print the plan, change nothing
  --status    Compare the database's migrations with this image and change nothing. Needs
              only the owner role's settings; tries to connect once
  --json      With --status: print one JSON object (docs/upgrade.md describes its fields)

Exit codes: 0 done or nothing to do, 1 failed, 2 invalid settings, 3 refused by a safety
check (schema newer than this image, missing privileges, unsupported database), 4 database
unreachable.
With --status: 0 the schema matches this image, 1 migrations are pending (run quro migrate),
3 the schema is newer than this image or unknown to it, 2 and 4 as above.`;

const EXIT_BY_OUTCOME: Record<MigrateOutcome['kind'], number> = {
  ok: EXIT_OK,
  refused: EXIT_REFUSED,
  unreachable: EXIT_UNAVAILABLE,
  rejected: EXIT_USAGE,
  failed: EXIT_FAILURE,
};

/** `--status` exit codes: the same meaning as `quro doctor`'s schema check. */
const EXIT_BY_SCHEMA_STATUS: Record<MigrationStatus['status'], number> = {
  current: EXIT_OK,
  behind: EXIT_FAILURE,
  empty: EXIT_FAILURE,
  ahead: EXIT_REFUSED,
  unknown: EXIT_REFUSED,
};

const JSON_INDENT = 2;

export type MigrateArgs = { dryRun: boolean; status: boolean; json: boolean };

export function parseMigrateArgs(args: readonly string[]): MigrateArgs {
  const parsed: MigrateArgs = { dryRun: false, status: false, json: false };
  for (const arg of args) {
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--status') parsed.status = true;
    else if (arg === '--json') parsed.json = true;
    else throw new UsageError(`Unknown argument: ${arg}`);
  }
  if (parsed.status && parsed.dryRun) {
    throw new UsageError('--status and --dry-run cannot be combined.');
  }
  if (parsed.json && !parsed.status) throw new UsageError('--json needs --status.');
  return parsed;
}

export type MigrateCommandOverrides = Pick<
  MigrateOptions,
  'connectAttempts' | 'retryDelayMs' | 'migrationsFolder' | 'signIn'
> & { runtimeRole?: boolean };

function printStatus(status: MigrationStatus, io: CommandIo) {
  const { database, applied, pending } = status;
  io.out(
    `Database: ${database.host}:${database.port}/${database.name} as ${database.user} (PostgreSQL ${database.serverVersion}).`,
  );
  io.out(
    `Applied: ${applied.migrations} migration(s)${applied.latestMigration ? `, newest ${applied.latestMigration}` : ''}.`,
  );
  if (pending.length > 0) io.out(`Pending: ${pending.join(', ')}.`);
  io.out(`Status: ${status.status}. ${status.message}`);
}

async function runStatus(
  json: boolean,
  io: CommandIo,
  overrides: MigrateCommandOverrides,
): Promise<number> {
  const admin = assertConfig('migrationStatus').adminDatabase;
  const outcome = await readMigrationStatus({
    connectAttempts: overrides.connectAttempts ?? 1,
    retryDelayMs: overrides.retryDelayMs,
    adminUrl: admin.url.reveal(),
    target: { host: admin.host, port: admin.port, database: admin.database, user: admin.user },
    // Standard output carries only the report, so progress goes to standard error.
    print: io.err,
  });
  if (outcome.kind !== 'ok') {
    io.err(outcome.message);
    return EXIT_BY_OUTCOME[outcome.kind];
  }
  const exitCode = EXIT_BY_SCHEMA_STATUS[outcome.status.status];
  if (json) io.out(JSON.stringify({ ...outcome.status, exitCode }, null, JSON_INDENT));
  else printStatus(outcome.status, io);
  return exitCode;
}

export async function runMigrateCommand(
  args: readonly string[],
  io: CommandIo,
  overrides: MigrateCommandOverrides = {},
): Promise<number> {
  if (args.includes('--help')) {
    io.out(MIGRATE_USAGE);
    return EXIT_OK;
  }
  const { dryRun, status, json } = parseMigrateArgs(args);
  if (status) return runStatus(json, io, overrides);
  const config = assertConfig('migrate');
  const admin = config.adminDatabase;
  const runtime = config.runtimeDatabase;
  const outcome = await migrateDatabase({
    ...overrides,
    adminUrl: admin.url.reveal(),
    target: { host: admin.host, port: admin.port, database: admin.database, user: admin.user },
    runtime:
      overrides.runtimeRole === false
        ? null
        : { user: runtime.user, url: runtime.url.reveal(), password: runtime.password.reveal() },
    dryRun,
    print: io.out,
  });
  if (outcome.kind !== 'ok') io.err(outcome.message);
  return EXIT_BY_OUTCOME[outcome.kind];
}
