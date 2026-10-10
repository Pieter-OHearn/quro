import { dirname, extname, resolve } from 'node:path';
import postgres from 'postgres';
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
  /** Dump the state of a snapshot exported by another session (`pg_export_snapshot()`). */
  snapshot?: string;
  /** Stops the dump when aborted. */
  signal?: AbortSignal;
  log?: (line: string) => void;
};

type RestoreOptions = {
  connectionString: string;
  inputPath: string;
  signal?: AbortSignal;
};

/** A client tool is missing, unreadable or older than the server: a setup problem, not data. */
export class PgToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgToolError';
  }
}

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

export async function createDatabaseBackup({
  connectionString,
  label,
  outputPath,
  snapshot,
  signal,
  log = (line) => console.log(line),
}: BackupOptions) {
  const resolvedOutputPath = outputPath ?? buildBackupPath(connectionString, label);
  const pgDump = resolvePgTool('pg_dump');
  // Before anything is written: a refused dump must not leave an empty file behind.
  await assertToolCoversServer('pg_dump', pgDump, connectionString);
  await ensureDirectory(dirname(resolvedOutputPath));
  const env = buildPgEnv(connectionString, APP_NAME_BY_TOOL.pg_dump);

  log(`Writing logical backup to ${resolvedOutputPath}`);
  const snapshotArgs = snapshot ? [`--snapshot=${snapshot}`] : [];
  await runPgTool(
    pgDump,
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      ...snapshotArgs,
      '--file',
      resolvedOutputPath,
    ],
    env,
    signal,
  );
  return resolvedOutputPath;
}

/** Refuses, before anything is written, when `pg_dump` is missing or older than the server. */
export async function checkPgDump(connectionString: string): Promise<void> {
  await assertToolCoversServer('pg_dump', resolvePgTool('pg_dump'), connectionString);
}

/** Refuses, before anything is changed, when `pg_restore` is missing or older than the server. */
export async function checkPgRestore(connectionString: string): Promise<void> {
  await assertToolCoversServer('pg_restore', resolvePgTool('pg_restore'), connectionString);
}

export async function restoreDatabaseBackup({
  connectionString,
  inputPath,
  signal,
}: RestoreOptions) {
  const extension = extname(inputPath).toLowerCase();
  const connection = parseConnectionString(connectionString);

  if (extension === '.sql') {
    const psql = resolvePgTool('psql');
    await assertToolCoversServer('psql', psql, connectionString);
    await runPgTool(
      psql,
      ['-v', 'ON_ERROR_STOP=1', '-d', connection.database, '-f', inputPath],
      buildPgEnv(connectionString, APP_NAME_BY_TOOL.psql),
    );
    return;
  }

  const pgRestore = resolvePgTool('pg_restore');
  await assertToolCoversServer('pg_restore', pgRestore, connectionString);
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
    signal,
  );
}

const TOOL_VERSION_PATTERN = /\(PostgreSQL\)\s+(\d+)/;

/** Major version from `pg_dump --version` style output, or null when it cannot be read. */
export function parsePgToolMajor(versionOutput: string) {
  const match = TOOL_VERSION_PATTERN.exec(versionOutput);
  return match ? Number(match[1]) : null;
}

// server_version_num is major * 10000 + minor since PostgreSQL 10 (for example 180006).
const VERSION_NUM_MAJOR_UNIT = 10_000;

/** Major version from `server_version_num` (for example 180006 is 18). */
export function serverMajorFromVersionNum(serverVersionNum: number) {
  return Math.floor(serverVersionNum / VERSION_NUM_MAJOR_UNIT);
}

/**
 * The refusal message when a client tool is older than the server, or null when the tool is
 * new enough. Older clients cannot dump a newer server (pg_dump stops with "server version
 * mismatch") and cannot be trusted to restore into one.
 */
export function describeToolVersionProblem(
  toolName: PgToolName,
  toolMajor: number,
  serverMajor: number,
) {
  if (toolMajor >= serverMajor) {
    return null;
  }
  return (
    `${toolName} is PostgreSQL ${toolMajor} but the database server is PostgreSQL ${serverMajor}. ` +
    'Backup and restore need client tools of the same or a newer major version than the server. ' +
    `Run the command from the Quro backend image, which ships current tools, or set ${OVERRIDE_SETTING_BY_TOOL[toolName]} ` +
    `to a ${toolName} of major version ${serverMajor} or newer.`
  );
}

/** Refuses to run a client tool whose major version is older than the server's. */
export async function assertToolCoversServer(
  toolName: PgToolName,
  command: string,
  connectionString: string,
) {
  const toolMajor = await readToolMajor(toolName, command);
  const serverMajor = await readServerMajor(connectionString);
  const problem = describeToolVersionProblem(toolName, toolMajor, serverMajor);
  if (problem) {
    throw new PgToolError(problem);
  }
}

async function readToolMajor(toolName: PgToolName, command: string) {
  let output = '';
  try {
    const processHandle = Bun.spawn([command, '--version'], { stderr: 'pipe', stdout: 'pipe' });
    output = await new Response(processHandle.stdout).text();
    await processHandle.exited;
  } catch {
    // Reported below with the same message as an unreadable version.
  }
  const major = parsePgToolMajor(output);
  if (major === null) {
    throw new PgToolError(
      `Could not read the version of ${toolName} (${command}). Set ${OVERRIDE_SETTING_BY_TOOL[toolName]} to a working PostgreSQL ${toolName}.`,
    );
  }
  return major;
}

async function readServerMajor(connectionString: string) {
  const { host, port } = parseConnectionString(connectionString);
  const sql = postgres(connectionString, { max: 1, connect_timeout: 10 });
  try {
    const [row] = await sql<{ num: number }[]>`
      select current_setting('server_version_num')::int as num
    `;
    if (!row) {
      throw new Error('empty result');
    }
    return serverMajorFromVersionNum(row.num);
  } catch (error) {
    throw new Error(
      `Could not read the PostgreSQL server version at ${host}:${port}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
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

  throw new PgToolError(
    `Missing ${toolName}. Install PostgreSQL client tools or set ${OVERRIDE_SETTING_BY_TOOL[toolName]} to the executable path.`,
  );
}

function spawnPgTool(
  command: string,
  args: string[],
  env: Record<string, string>,
  signal?: AbortSignal,
) {
  const processHandle = Bun.spawn([command, ...args], {
    env,
    signal,
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit',
  });

  return processHandle.exited;
}

async function runPgTool(
  command: string,
  args: string[],
  env: Record<string, string>,
  signal?: AbortSignal,
) {
  const exitCode = await spawnPgTool(command, args, env, signal);
  signal?.throwIfAborted();
  if (exitCode !== 0) {
    throw new Error(`${command} exited with status ${exitCode}`);
  }
}

/** Runs `psql` against the connection string, passing the credentials through the environment. */
export function runPsql(connectionString: string, args: string[]) {
  return spawnPgTool(resolvePgTool('psql'), args, buildPgEnv(connectionString, 'quro-db-psql'));
}

/** Major version of the configured or installed client tool; throws when it cannot be read. */
export function readInstalledToolMajor(toolName: PgToolName) {
  return readToolMajor(toolName, resolvePgTool(toolName));
}
