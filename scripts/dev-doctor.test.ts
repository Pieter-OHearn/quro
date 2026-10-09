import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  checkBun,
  checkDatabaseUrls,
  checkDependencies,
  checkDockerCompose,
  checkGitHooks,
  checkPython,
  checkTool,
  formatReport,
  parseDatabaseTarget,
  runDoctor,
  type CheckResult,
  type CommandResult,
  type DoctorContext,
} from './dev-doctor';

// Synthetic, deterministic fixtures: fake paths, versions and credentials only.
const ROOT = '/work/quro';
const PASSWORD_PROBE = 'redaction-probe-value';
const THROWAWAY_URL = `postgres://quro:${PASSWORD_PROBE}@127.0.0.1:55432/quro`;
const HEALTHY_COMMANDS: Record<string, CommandResult> = {
  '/usr/bin/python3 --version': { ok: true, stdout: 'Python 3.12.11\n' },
  [`git -C ${ROOT} config --get core.hooksPath`]: { ok: true, stdout: '.githooks\n' },
  'docker compose version --short': { ok: true, stdout: '2.39.4\n' },
};

function fixtureContext(overrides: Partial<DoctorContext> = {}): DoctorContext {
  const files = new Map<string, string>([
    [`${ROOT}/.bun-version`, '1.4.2\n'],
    [`${ROOT}/bun.lock`, ''],
    [`${ROOT}/node_modules`, ''],
  ]);
  return {
    root: ROOT,
    env: {
      PATH: '/usr/bin',
      DATABASE_URL: THROWAWAY_URL,
      ADMIN_DATABASE_URL: THROWAWAY_URL,
      APP_DATABASE_URL: THROWAWAY_URL,
    },
    bunVersion: '1.4.2',
    run: (command, args) =>
      HEALTHY_COMMANDS[[command, ...args].join(' ')] ?? { ok: false, stdout: '' },
    which: (command) => `/usr/bin/${command}`,
    exists: (path) => files.has(path),
    readText: (path) => files.get(path) ?? '',
    ...overrides,
  };
}

const statuses = (results: CheckResult[]) => results.map((result) => result.status);

describe('dev doctor', () => {
  test('a complete environment passes without warnings', () => {
    const results = runDoctor(fixtureContext());
    expect(results.filter((result) => result.status !== 'ok')).toEqual([]);
  });

  test('fails on a Bun version that does not match the pin', () => {
    const result = checkBun(fixtureContext({ bunVersion: '1.3.10' }));
    expect(result.status).toBe('fail');
    expect(result.detail).toContain('1.3.10');
    expect(result.detail).toContain('1.4.2');
  });

  test('fails on a missing or malformed .bun-version', () => {
    expect(checkBun(fixtureContext({ exists: () => false })).status).toBe('fail');
    const malformed = checkBun(fixtureContext({ readText: () => 'latest\n' }));
    expect(malformed.status).toBe('fail');
    expect(malformed.detail).toContain('malformed');
  });

  test('fails when dependencies are not installed', () => {
    const result = checkDependencies(
      fixtureContext({ exists: (path) => path === `${ROOT}/bun.lock` }),
    );
    expect(result).toMatchObject({ status: 'fail', fix: 'bun install --frozen-lockfile' });
  });

  test('missing optional tooling warns instead of failing', () => {
    const results = runDoctor(
      fixtureContext({ run: () => ({ ok: false, stdout: '' }), which: () => null }),
    );
    const byName = new Map(results.map((result) => [result.name, result.status]));
    for (const name of ['Python', 'ruff', 'pip-audit', 'gitleaks', 'Git hooks', 'Docker Compose']) {
      expect({ name, status: byName.get(name) }).toEqual({ name, status: 'warn' });
    }
    expect(statuses(results)).not.toContain('fail');
  });

  test('checks the Python version against CI', () => {
    const python = (stdout: string) =>
      checkPython(fixtureContext({ run: () => ({ ok: true, stdout }) }));
    expect(python('Python 3.11.9').status).toBe('warn');
    expect(python('Python 3.12.11').status).toBe('ok');
    expect(python('Python 3.14.7')).toMatchObject({ status: 'ok' });
    expect(python('Python 3.14.7').detail).toContain('3.12');
  });

  test('checks the Python from the repository .venv before PATH', () => {
    const calls: string[] = [];
    const result = checkPython(
      fixtureContext({
        which: (command, path) => `${path.split(':')[0]}/${command}`,
        run: (command) => {
          calls.push(command);
          return { ok: true, stdout: 'Python 3.12.11' };
        },
      }),
    );
    expect(calls).toEqual([`${ROOT}/.venv/bin/python3`]);
    expect(result.status).toBe('ok');
  });

  test('accepts an absolute hooks path to the checked-in hooks', () => {
    const result = checkGitHooks(
      fixtureContext({ run: () => ({ ok: true, stdout: `${ROOT}/.githooks/\n` }) }),
    );
    expect(result.status).toBe('ok');
    expect(
      checkGitHooks(fixtureContext({ run: () => ({ ok: true, stdout: '.husky' }) })).status,
    ).toBe('warn');
  });

  test('prefers tools from the repository .venv', () => {
    const result = checkTool(
      fixtureContext({ which: (command, path) => `${path.split(':')[0]}/${command}` }),
      'pip-audit',
      'ci:check',
      'install it',
    );
    expect(result).toMatchObject({ status: 'ok', detail: 'found on .venv/bin' });
  });

  test('warns on Compose v1', () => {
    const result = checkDockerCompose(
      fixtureContext({ run: () => ({ ok: true, stdout: '1.29.2' }) }),
    );
    expect(result.status).toBe('warn');
  });

  test('parses a database target without credentials', () => {
    expect(parseDatabaseTarget(THROWAWAY_URL)).toEqual({
      host: '127.0.0.1',
      port: '55432',
      database: 'quro',
    });
    expect(parseDatabaseTarget('postgresql://db/quro')).toEqual({
      host: 'db',
      port: '5432',
      database: 'quro',
    });
  });

  test.each([
    `mysql://quro:${PASSWORD_PROBE}@db:3306/quro`,
    `not a url ${PASSWORD_PROBE}`,
    `postgres://quro:${PASSWORD_PROBE}@`,
    `postgres://quro:${PASSWORD_PROBE}@db:notaport/quro`,
    `postgres://quro:${PASSWORD_PROBE}@db:5432/qu%zzro`,
  ])('fails on a malformed URL without printing it: %#', (value) => {
    const results = checkDatabaseUrls(
      fixtureContext({ env: { DATABASE_URL: value, ADMIN_DATABASE_URL: value } }),
    );
    expect(results.find((result) => result.name === 'DATABASE_URL')?.status).toBe('fail');
    expect(results.find((result) => result.name === 'ADMIN_DATABASE_URL')?.status).toBe('fail');
    const report = formatReport(results);
    expect(report).not.toContain(PASSWORD_PROBE);
    expect(report).not.toContain(value);
  });

  test('reports valid URLs by host, port and database only', () => {
    const report = formatReport(runDoctor(fixtureContext()));
    expect(report).toContain('127.0.0.1:55432/quro');
    expect(report).not.toContain(PASSWORD_PROBE);
    expect(report).not.toContain('quro:');
  });

  test('warns when a URL points at the development Compose port', () => {
    const composeUrl = `postgres://quro:${PASSWORD_PROBE}@localhost:5432/quro`;
    const results = checkDatabaseUrls(
      fixtureContext({
        env: {
          DATABASE_URL: composeUrl,
          ADMIN_DATABASE_URL: composeUrl,
          APP_DATABASE_URL: composeUrl,
        },
      }),
    );
    expect(statuses(results)).toEqual(['warn', 'warn', 'warn']);
  });

  test('warns when DATABASE_URL is not exported', () => {
    const results = checkDatabaseUrls(fixtureContext({ env: {} }));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'DATABASE_URL', status: 'warn' });
  });

  test('warns when the role URLs are missing or point elsewhere', () => {
    const missing = checkDatabaseUrls(fixtureContext({ env: { DATABASE_URL: THROWAWAY_URL } }));
    expect(missing.filter((result) => result.status === 'warn').map((r) => r.name)).toEqual([
      'ADMIN_DATABASE_URL',
      'APP_DATABASE_URL',
    ]);

    const elsewhere = checkDatabaseUrls(
      fixtureContext({
        env: {
          DATABASE_URL: THROWAWAY_URL,
          ADMIN_DATABASE_URL: 'postgres://admin@127.0.0.1:55433/quro',
          APP_DATABASE_URL: THROWAWAY_URL,
        },
      }),
    );
    expect(elsewhere.filter((result) => result.status === 'warn')).toEqual([
      expect.objectContaining({ name: 'ADMIN_DATABASE_URL' }),
    ]);
  });
});

describe('dev doctor command', () => {
  const repoRoot = join(import.meta.dir, '..');
  const tempDirectories: string[] = [];

  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  function runScript(scriptPath: string, cwd: string, env: Record<string, string>) {
    return spawnSync(process.execPath, ['--no-env-file', scriptPath], {
      cwd,
      encoding: 'utf8',
      env,
    });
  }

  test('the package script disables .env loading', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts['dev:doctor']).toBe('bun --no-env-file scripts/dev-doctor.ts');
  });

  test('exits non-zero on malformed configuration with missing tools, printing no secret', () => {
    const statusBefore = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const result = runScript(join(repoRoot, 'scripts', 'dev-doctor.ts'), repoRoot, {
      PATH: dirname(process.execPath),
      DATABASE_URL: `mysql://quro:${PASSWORD_PROBE}@db/quro`,
    });
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain('FAIL  DATABASE_URL');
    expect(output).not.toContain(PASSWORD_PROBE);
    expect(
      execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }),
    ).toBe(statusBefore);
  });

  test('does not read .env files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'quro-dev-doctor-'));
    tempDirectories.push(directory);
    mkdirSync(join(directory, 'scripts'));
    copyFileSync(
      join(repoRoot, 'scripts', 'dev-doctor.ts'),
      join(directory, 'scripts', 'dev-doctor.ts'),
    );
    writeFileSync(join(directory, '.bun-version'), `${Bun.version}\n`);
    writeFileSync(
      join(directory, '.env'),
      `DATABASE_URL=postgres://quro:${PASSWORD_PROBE}@dotenv-host/quro\n`,
    );

    const result = runScript(join(directory, 'scripts', 'dev-doctor.ts'), directory, {
      PATH: dirname(process.execPath),
    });
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('DATABASE_URL');
    expect(output).toContain('not exported');
    expect(output).not.toContain('dotenv-host');
    expect(output).not.toContain(PASSWORD_PROBE);
  });
});
