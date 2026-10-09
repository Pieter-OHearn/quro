import { bootConfig } from '../config';
import { getAdminDatabaseUrl } from './config';
import { runPsql } from './pgTools';

// Opens `psql` as the owner role. Credentials reach it through PG* environment variables, never
// through the command line.
bootConfig('backup');
const ARGUMENTS_START = 2; // argv is [bun, script, ...arguments]
process.exit(await runPsql(getAdminDatabaseUrl(), process.argv.slice(ARGUMENTS_START)));
