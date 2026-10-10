import { assertConfig, ConfigError, formatProblems } from '../config';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, UsageError, type CommandIo } from './io';

// `quro` is the operator command line inside the backend image (`docker compose exec backend
// quro ...`). Command groups load lazily so `quro --help` needs no database configuration.

export const QURO_USAGE = `Usage: quro <command> [options]

Commands:
  user        Accounts, registration codes, password resets and sessions (quro user --help)
  documents   Document storage: copy documents out of S3 (quro documents --help)
  backup      Write one archive of the database and documents (quro backup --help)
  restore     Restore an archive written by quro backup (quro restore --help)`;

type CommandGroup = {
  usage: () => Promise<string>;
  run: (args: readonly string[], io: CommandIo) => Promise<number>;
};

let usesDatabase = false;
const POOL_CLOSE_TIMEOUT_SECONDS = 5;

const GROUPS: Record<string, CommandGroup> = {
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
  // Backup and restore open their own owner-role connections and close them.
  backup: {
    usage: async () => (await import('./backup')).BACKUP_USAGE,
    run: async (args, io) => (await import('./backup')).runBackupCommand(args, io),
  },
  restore: {
    usage: async () => (await import('./restore')).RESTORE_USAGE,
    run: async (args, io) => (await import('./restore')).runRestoreCommand(args, io),
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
