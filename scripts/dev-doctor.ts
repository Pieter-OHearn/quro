import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

// Contributor environment check for a source checkout. It runs version commands and reads
// exported environment variables only: it never opens a database connection, never reads
// .env or secret files (run it with `bun --no-env-file`), never writes files and never
// prints a connection string.

export type CheckStatus = 'ok' | 'warn' | 'fail';

export type CheckResult = {
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
};

export type CommandResult = { ok: boolean; stdout: string };

export type DoctorContext = {
  root: string;
  env: Record<string, string | undefined>;
  bunVersion: string;
  run: (command: string, args: string[]) => CommandResult;
  which: (command: string, path: string) => string | null;
  exists: (path: string) => boolean;
  readText: (path: string) => string;
};

const SUPPORTED_PYTHON = { major: 3, minor: 12 };
const MIN_COMPOSE_MAJOR = 2;
const DATABASE_URL_KEYS = ['DATABASE_URL', 'ADMIN_DATABASE_URL', 'APP_DATABASE_URL'] as const;
const COMPOSE_DB_PORT = '5432';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const PYTHON_TOOLS_FIX =
  'python3 -m venv .venv && . .venv/bin/activate && pip install -r services/pension-parser/requirements.txt ruff pip-audit';
const THROWAWAY_DB_DOC = 'see "DB-backed tests" in docs/development.md';

function parseVersion(text: string): number[] | null {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  if (!match) return null;
  const [, major, minor, patch = '0'] = match;
  return [Number(major), Number(minor), Number(patch)];
}

export function checkBun(ctx: DoctorContext): CheckResult {
  const pinPath = join(ctx.root, '.bun-version');
  if (!ctx.exists(pinPath)) {
    return { name: 'Bun', status: 'fail', detail: '.bun-version is missing' };
  }
  const expected = ctx.readText(pinPath).trim();
  if (!/^\d+\.\d+\.\d+$/.test(expected)) {
    return {
      name: 'Bun',
      status: 'fail',
      detail: '.bun-version is malformed; expected a single x.y.z version',
    };
  }
  if (ctx.bunVersion !== expected) {
    return {
      name: 'Bun',
      status: 'fail',
      detail: `running Bun ${ctx.bunVersion}, .bun-version pins ${expected}`,
      fix: `install Bun ${expected}: https://bun.sh/docs/installation`,
    };
  }
  return { name: 'Bun', status: 'ok', detail: `${expected} matches .bun-version` };
}

export function checkDependencies(ctx: DoctorContext): CheckResult {
  if (!ctx.exists(join(ctx.root, 'bun.lock'))) {
    return { name: 'Dependencies', status: 'fail', detail: 'bun.lock is missing' };
  }
  if (!ctx.exists(join(ctx.root, 'node_modules'))) {
    return {
      name: 'Dependencies',
      status: 'fail',
      detail: 'node_modules is missing',
      fix: 'bun install --frozen-lockfile',
    };
  }
  return { name: 'Dependencies', status: 'ok', detail: 'installed (bun.lock present)' };
}

export function checkPython(ctx: DoctorContext): CheckResult {
  const result = ctx.run('python3', ['--version']);
  const version = result.ok ? parseVersion(result.stdout) : null;
  const wanted = `${SUPPORTED_PYTHON.major}.${SUPPORTED_PYTHON.minor}`;
  if (!version) {
    return {
      name: 'Python',
      status: 'warn',
      detail: `python3 not found; ci:check and the pension parser need Python ${wanted}`,
      fix: `install Python ${wanted}`,
    };
  }
  const [major, minor] = version;
  const label = version.join('.');
  if (major !== SUPPORTED_PYTHON.major || minor < SUPPORTED_PYTHON.minor) {
    return {
      name: 'Python',
      status: 'warn',
      detail: `python3 is ${label}; CI and the parser image use ${wanted}`,
      fix: `install Python ${wanted}`,
    };
  }
  const note =
    minor === SUPPORTED_PYTHON.minor ? 'matches CI' : `CI and the parser image use ${wanted}`;
  return { name: 'Python', status: 'ok', detail: `${label} (${note})` };
}

function toolPath(ctx: DoctorContext): string {
  return [join(ctx.root, '.venv', 'bin'), ctx.env.PATH ?? ''].filter(Boolean).join(delimiter);
}

export function checkTool(
  ctx: DoctorContext,
  name: string,
  neededBy: string,
  fix: string,
): CheckResult {
  const found = ctx.which(name, toolPath(ctx));
  if (!found) {
    return {
      name,
      status: 'warn',
      detail: `not found in .venv/bin or PATH; ${neededBy} needs it`,
      fix,
    };
  }
  const where = found.startsWith(join(ctx.root, '.venv')) ? '.venv/bin' : 'PATH';
  return { name, status: 'ok', detail: `found on ${where}` };
}

export function checkGitHooks(ctx: DoctorContext): CheckResult {
  const result = ctx.run('git', ['-C', ctx.root, 'config', '--get', 'core.hooksPath']);
  if (result.ok && result.stdout.trim() === '.githooks') {
    return { name: 'Git hooks', status: 'ok', detail: 'core.hooksPath is .githooks' };
  }
  return {
    name: 'Git hooks',
    status: 'warn',
    detail: 'the checked-in pre-commit hook is not installed',
    fix: 'bun run hooks:install',
  };
}

export function checkDockerCompose(ctx: DoctorContext): CheckResult {
  const result = ctx.run('docker', ['compose', 'version', '--short']);
  const version = result.ok ? parseVersion(result.stdout) : null;
  if (!version) {
    return {
      name: 'Docker Compose',
      status: 'warn',
      detail:
        'docker compose not found; the Docker dev stack and a throwaway test database need it',
      fix: 'install Docker with the Compose v2 plugin',
    };
  }
  if (version[0] < MIN_COMPOSE_MAJOR) {
    return {
      name: 'Docker Compose',
      status: 'warn',
      detail: `Compose ${version.join('.')} is older than v2`,
      fix: 'install the Compose v2 plugin',
    };
  }
  return { name: 'Docker Compose', status: 'ok', detail: version.join('.') };
}

type DatabaseTarget = { host: string; port: string; database: string };

// Returns only host, port and database name; user names and passwords never leave here.
export function parseDatabaseTarget(value: string): DatabaseTarget | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return null;
  if (!url.hostname) return null;
  return {
    host: url.hostname,
    port: url.port || COMPOSE_DB_PORT,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

function describeTarget(target: DatabaseTarget): string {
  return `${target.host}:${target.port}/${target.database || '(default database)'}`;
}

function checkDatabaseUrl(key: string, value: string): CheckResult {
  const target = parseDatabaseTarget(value);
  if (!target) {
    return {
      name: key,
      status: 'fail',
      detail: 'is set but is not a postgres:// or postgresql:// URL with a host (value not shown)',
      fix: `export ${key}=postgres://<user>:<password>@<host>:<port>/<database>`,
    };
  }
  if (LOOPBACK_HOSTS.has(target.host) && target.port === COMPOSE_DB_PORT) {
    return {
      name: key,
      status: 'warn',
      detail: `points at ${describeTarget(target)}, the port the development Compose db publishes; use a throwaway database for tests`,
      fix: THROWAWAY_DB_DOC,
    };
  }
  return { name: key, status: 'ok', detail: `points at ${describeTarget(target)}` };
}

function checkRoleUrl(
  key: 'ADMIN_DATABASE_URL' | 'APP_DATABASE_URL',
  value: string | undefined,
  shared: DatabaseTarget,
): CheckResult | null {
  if (!value) {
    return {
      name: key,
      status: 'warn',
      detail:
        'not exported; commands run outside the test scripts may take it from packages/backend/.env',
      fix: `export ${key}="$DATABASE_URL"`,
    };
  }
  const target = parseDatabaseTarget(value);
  if (target && describeTarget(target) !== describeTarget(shared)) {
    return {
      name: key,
      status: 'warn',
      detail: `points at a different database than DATABASE_URL (${describeTarget(shared)})`,
    };
  }
  return null;
}

export function checkDatabaseUrls(ctx: DoctorContext): CheckResult[] {
  const values = Object.fromEntries(
    DATABASE_URL_KEYS.map((key) => [key, ctx.env[key]?.trim() || undefined]),
  ) as Record<(typeof DATABASE_URL_KEYS)[number], string | undefined>;
  const results = DATABASE_URL_KEYS.flatMap((key) => {
    const value = values[key];
    return value ? [checkDatabaseUrl(key, value)] : [];
  });

  if (!values.DATABASE_URL) {
    results.push({
      name: 'DATABASE_URL',
      status: 'warn',
      detail: 'not exported; DB-backed tests, ci:check and test:smoke refuse to run without it',
      fix: THROWAWAY_DB_DOC,
    });
    return results;
  }
  const shared = parseDatabaseTarget(values.DATABASE_URL);
  if (!shared) return results;
  for (const key of ['ADMIN_DATABASE_URL', 'APP_DATABASE_URL'] as const) {
    const result = checkRoleUrl(key, values[key], shared);
    if (result) results.push(result);
  }
  return results;
}

export function runDoctor(ctx: DoctorContext): CheckResult[] {
  return [
    checkBun(ctx),
    checkDependencies(ctx),
    checkPython(ctx),
    checkTool(ctx, 'ruff', 'ci:check', PYTHON_TOOLS_FIX),
    checkTool(ctx, 'pip-audit', 'ci:check', PYTHON_TOOLS_FIX),
    checkTool(ctx, 'gitleaks', 'the pre-commit hook', 'brew install gitleaks'),
    checkGitHooks(ctx),
    checkDockerCompose(ctx),
    ...checkDatabaseUrls(ctx),
  ];
}

const STATUS_LABEL: Record<CheckStatus, string> = { ok: 'ok  ', warn: 'warn', fail: 'FAIL' };

export function formatReport(results: readonly CheckResult[]): string {
  const width = Math.max(...results.map((result) => result.name.length));
  const lines = results.flatMap((result) => {
    const line = `  ${STATUS_LABEL[result.status]}  ${result.name.padEnd(width)}  ${result.detail}`;
    return result.fix ? [line, `        ${' '.repeat(width)}  fix: ${result.fix}`] : [line];
  });
  const failures = results.filter((result) => result.status === 'fail').length;
  const warnings = results.filter((result) => result.status === 'warn').length;
  return [
    'Quro development doctor: checks this checkout and exported variables only.',
    '',
    ...lines,
    '',
    `${failures} failed, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}.`,
  ].join('\n');
}

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  });
  // Some tools print their version on stderr; neither stream is echoed.
  return { ok: result.status === 0, stdout: result.stdout || result.stderr || '' };
}

if (import.meta.main) {
  const results = runDoctor({
    root: join(import.meta.dir, '..'),
    env: process.env,
    bunVersion: Bun.version,
    run: runCommand,
    which: (command, path) => Bun.which(command, { PATH: path }),
    exists: existsSync,
    readText: (path) => readFileSync(path, 'utf8'),
  });
  console.log(formatReport(results));
  process.exit(results.some((result) => result.status === 'fail') ? 1 : 0);
}
