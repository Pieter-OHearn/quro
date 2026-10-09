import { dirname, extname, resolve } from 'node:path';
import { childProcessEnv, getConfig } from '../config';
import {
  backupDirectory,
  ensureDirectory,
  getTimestamp,
  parseConnectionString,
} from './maintenance';

type BackupOptions = {
  connectionString: string;
  label?: string;
  outputPath?: string;
};

type RestoreOptions = {
  connectionString: string;
  inputPath: string;
};

type PgToolName = 'pg_dump' | 'pg_restore' | 'psql';

const APP_NAME_BY_TOOL: Record<PgToolName, string> = {
  pg_dump: 'quro-db-backup',
  pg_restore: 'quro-db-restore',
  psql: 'quro-db-restore',
};

const OVERRIDE_SETTING_BY_TOOL: Record<PgToolName, string> = {
  pg_dump: 'QRO_PG_DUMP_BIN',
  pg_restore: 'QRO_PG_RESTORE_BIN',
  psql: 'QRO_PSQL_BIN',
};

const OVERRIDE_KEY_BY_TOOL = {
  pg_dump: 'pgDump',
  pg_restore: 'pgRestore',
  psql: 'psql',
} as const;

export async function createDatabaseBackup({ connectionString, label, outputPath }: BackupOptions) {
  const resolvedOutputPath = outputPath ?? buildBackupPath(connectionString, label);
  await ensureDirectory(dirname(resolvedOutputPath));
  const pgDump = resolvePgTool('pg_dump');
  const env = buildPgEnv(connectionString, APP_NAME_BY_TOOL.pg_dump);

  console.log(`Writing logical backup to ${resolvedOutputPath}`);
  await runPgTool(
    pgDump,
    ['--format=custom', '--no-owner', '--no-privileges', '--file', resolvedOutputPath],
    env,
  );
  return resolvedOutputPath;
}

export async function restoreDatabaseBackup({ connectionString, inputPath }: RestoreOptions) {
  const extension = extname(inputPath).toLowerCase();
  const connection = parseConnectionString(connectionString);

  if (extension === '.sql') {
    const psql = resolvePgTool('psql');
    await runPgTool(
      psql,
      ['-v', 'ON_ERROR_STOP=1', '-d', connection.database, '-f', inputPath],
      buildPgEnv(connectionString, APP_NAME_BY_TOOL.psql),
    );
    return;
  }

  const pgRestore = resolvePgTool('pg_restore');
  await runPgTool(
    pgRestore,
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--dbname',
      connection.database,
      inputPath,
    ],
    buildPgEnv(connectionString, APP_NAME_BY_TOOL.pg_restore),
  );
}

function buildBackupPath(connectionString: string, label?: string) {
  const { database } = parseConnectionString(connectionString);
  const suffix = label ? `-${label}` : '';
  return resolve(backupDirectory, `${database}-${getTimestamp()}${suffix}.dump`);
}

function buildPgEnv(connectionString: string, appName: string) {
  const connection = parseConnectionString(connectionString);
  const env = {
    ...childProcessEnv(),
    PGAPPNAME: appName,
    PGDATABASE: connection.database,
    PGHOST: connection.host,
    PGPASSWORD: connection.password,
    PGPORT: connection.port,
    PGUSER: connection.user,
  } as Record<string, string>;

  if (connection.sslmode) {
    env.PGSSLMODE = connection.sslmode;
  }

  return env;
}

function resolvePgTool(toolName: PgToolName) {
  const override = getConfig().tools[OVERRIDE_KEY_BY_TOOL[toolName]];
  if (override) {
    return override;
  }

  const resolved = Bun.which(toolName);
  if (resolved) {
    return resolved;
  }

  throw new Error(
    `Missing ${toolName}. Install PostgreSQL client tools or set ${OVERRIDE_SETTING_BY_TOOL[toolName]} to the executable path.`,
  );
}

function spawnPgTool(command: string, args: string[], env: Record<string, string>) {
  const processHandle = Bun.spawn([command, ...args], {
    env,
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit',
  });

  return processHandle.exited;
}

async function runPgTool(command: string, args: string[], env: Record<string, string>) {
  const exitCode = await spawnPgTool(command, args, env);
  if (exitCode !== 0) {
    throw new Error(`${command} exited with status ${exitCode}`);
  }
}

/** Runs `psql` against the connection string, passing the credentials through the environment. */
export function runPsql(connectionString: string, args: string[]) {
  return spawnPgTool(resolvePgTool('psql'), args, buildPgEnv(connectionString, 'quro-db-psql'));
}
