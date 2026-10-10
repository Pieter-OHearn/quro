import { runMigrateCommand } from '../cli/migrate';
import { bootConfig } from '../config';

// `bun run db:migrate`: the schema migrations of `quro migrate` for development and tests, with
// the same checks and lock. It leaves the runtime role alone; `quro migrate` also prepares it.
bootConfig('migrate');
const io = { out: (line: string) => console.log(line), err: (line: string) => console.error(line) };
const exitCode = await runMigrateCommand(process.argv.slice(2), io, { runtimeRole: false }).catch(
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  },
);
process.exit(exitCode);
