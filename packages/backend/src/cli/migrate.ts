import { assertConfig } from '../config';
import { migrateDatabase, type MigrateOptions, type MigrateOutcome } from '../db/migrateDatabase';
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

Applies pending schema migrations as the owner role (POSTGRES_ADMIN_USER), then creates or
updates the runtime role (POSTGRES_APP_USER) and its grants. Runs one at a time per database;
a second run waits for the first and then changes nothing.

Options:
  --dry-run   Check settings, privileges and the schema, print the plan, change nothing

Exit codes: 0 done or nothing to do, 1 failed, 2 invalid settings, 3 refused by a safety
check (schema newer than this image, missing privileges, unsupported database), 4 database
unreachable.`;

const EXIT_BY_OUTCOME: Record<MigrateOutcome['kind'], number> = {
  ok: EXIT_OK,
  refused: EXIT_REFUSED,
  unreachable: EXIT_UNAVAILABLE,
  rejected: EXIT_USAGE,
  failed: EXIT_FAILURE,
};

export function parseMigrateArgs(args: readonly string[]): { dryRun: boolean } {
  let dryRun = false;
  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true;
    else throw new UsageError(`Unknown argument: ${arg}`);
  }
  return { dryRun };
}

export type MigrateCommandOverrides = Pick<
  MigrateOptions,
  'connectAttempts' | 'retryDelayMs' | 'migrationsFolder' | 'signIn'
> & { runtimeRole?: boolean };

export async function runMigrateCommand(
  args: readonly string[],
  io: CommandIo,
  overrides: MigrateCommandOverrides = {},
): Promise<number> {
  if (args.includes('--help')) {
    io.out(MIGRATE_USAGE);
    return EXIT_OK;
  }
  const { dryRun } = parseMigrateArgs(args);
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
