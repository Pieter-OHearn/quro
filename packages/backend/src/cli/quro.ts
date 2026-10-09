import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, UsageError, type CommandIo } from './io';

// `quro` is the operator command line inside the backend image (`docker compose exec backend
// quro ...`). Command groups load lazily so `quro --help` needs no database configuration.

export const QURO_USAGE = `Usage: quro <command> [options]

Commands:
  user    Accounts, registration codes, password resets and sessions (quro user --help)`;

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
      usesDatabase = true;
      return (await import('./user')).runUserCommand(args, io);
    },
  },
};

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
    if (!(error instanceof UsageError)) throw error;
    io.err(error.message);
    io.err(await group.usage());
    return EXIT_USAGE;
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
