import { assertConfig, ConfigError, formatProblems } from '../config';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, UsageError, type CommandIo } from './io';

// `quro` is the operator command line inside the backend image (`docker compose exec backend
// quro ...`). Command groups load lazily so `quro --help` needs no database configuration.

export const QURO_USAGE = `Usage: quro <command> [options]

Commands:
  serve       Run the API server (the image's default command)
  worker      Run the optional pension import worker (quro worker pension-imports)
  init        Write a settings file and generated secret files into a directory (quro init --help)
  migrate     Apply schema migrations and prepare the runtime role (quro migrate --help)
  doctor      Read-only checks of settings, database, schema and storage (quro doctor --help)
  health      Exit 0 when the local server reports ready (container health checks)
  version     Print the version, newest bundled migration and image revision
  user        Accounts, registration codes, password resets and sessions (quro user --help)
  documents   Document storage: copy documents out of S3 (quro documents --help)

Exit codes: 0 done, 1 failed, 2 invalid usage or settings, 3 refused by a safety check,
4 database or document store unreachable.`;

type CommandGroup = {
  usage: () => Promise<string>;
  run: (args: readonly string[], io: CommandIo) => Promise<number>;
};

let usesDatabase = false;
const POOL_CLOSE_TIMEOUT_SECONDS = 5;

const GROUPS: Record<string, CommandGroup> = {
  serve: {
    usage: async () => (await import('./service')).SERVICE_USAGE.serve,
    run: async (args) => (await import('./service')).runServeCommand(args),
  },
  worker: {
    usage: async () => (await import('./service')).SERVICE_USAGE.worker,
    run: async (args) => (await import('./service')).runWorkerCommand(args),
  },
  init: {
    usage: async () => (await import('./init')).INIT_USAGE,
    run: async (args, io) => (await import('./init')).runInitCommand(args, io),
  },
  migrate: {
    usage: async () => (await import('./migrate')).MIGRATE_USAGE,
    run: async (args, io) => (await import('./migrate')).runMigrateCommand(args, io),
  },
  doctor: {
    usage: async () => (await import('./doctor')).DOCTOR_USAGE,
    run: async (args, io) => (await import('./doctor')).runDoctorCommand(args, io),
  },
  health: {
    usage: async () => (await import('./service')).SERVICE_USAGE.health,
    run: async (args, io) => (await import('./service')).runHealthCommand(args, io),
  },
  version: {
    usage: async () => (await import('./service')).SERVICE_USAGE.version,
    run: async (args, io) => (await import('./service')).runVersionCommand(args, io),
  },
  user: {
    usage: async () => (await import('./user')).USER_USAGE,
    run: async (args, io) => {
      assertConfig('cli');
      usesDatabase = true;
      return (await import('./user')).runUserCommand(args, io);
    },
  },
  documents: {
    usage: async () => (await import('./documents')).DOCUMENTS_USAGE,
    run: async (args, io) => {
      usesDatabase = true;
      return (await import('./documents')).runDocumentsCommand(args, io);
    },
  },
};

/** Exit code for a settings or usage mistake; anything else is not handled here. */
async function reportCommandError(
  error: unknown,
  group: CommandGroup,
  io: CommandIo,
): Promise<number> {
  // Invalid settings: the full list, which names settings and never their values (exit code 2).
  if (error instanceof ConfigError) {
    io.err(formatProblems(error.problems));
    return error.exitCode;
  }
  if (!(error instanceof UsageError)) throw error;
  io.err(error.message);
  io.err(await group.usage());
  return EXIT_USAGE;
}

export async function runQuro(args: readonly string[], io: CommandIo): Promise<number> {
  const [name, ...rest] = args;
  if (name === undefined || name === '--help' || name === 'help') {
    (name === undefined ? io.err : io.out)(QURO_USAGE);
    return name === undefined ? EXIT_USAGE : EXIT_OK;
  }
  const group = Object.hasOwn(GROUPS, name) ? GROUPS[name] : undefined;
  if (!group) {
    io.err(`Unknown command: ${name}`);
    io.err(QURO_USAGE);
    return EXIT_USAGE;
  }
  if (rest[0] === '--help') {
    io.out(await group.usage());
    return EXIT_OK;
  }
  try {
    return await group.run(rest, io);
  } catch (error) {
    return reportCommandError(error, group, io);
  }
}

if (import.meta.main) {
  let exitCode = EXIT_FAILURE;
  try {
    // argv is [bun, script, ...arguments].
    const [, , ...args] = process.argv;
    exitCode = await runQuro(args, {
      out: (line) => console.log(line),
      err: (line) => console.error(line),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  } finally {
    if (usesDatabase) {
      // A missing database configuration already failed the command; nothing to close then.
      await import('../db/client')
        .then(({ queryClient }) => queryClient.end({ timeout: POOL_CLOSE_TIMEOUT_SECONDS }))
        .catch(() => undefined);
    }
  }
  process.exit(exitCode);
}
