import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, PROFILES } from '../config';
import { SETTINGS } from '../config/settings';
import {
  createFileExclusively,
  GENERATED_SECRETS,
  renderSettingsFile,
  runInitCommand,
  SECRETS_DIR,
  SETTINGS_FILE,
} from './init';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from './io';

const directories: string[] = [];

function configDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quro-init-'));
  directories.push(dir);
  return dir;
}

function init(...args: string[]) {
  const lines: string[] = [];
  const exitCode = runInitCommand(args, {
    out: (line) => lines.push(line),
    err: (line) => lines.push(line),
  });
  return { exitCode, out: lines.join('\n') };
}

const secretPath = (dir: string, name: string) => join(dir, SECRETS_DIR, name);
const mode = (path: string) => statSync(path).mode & 0o777;

function snapshot(dir: string) {
  return [SETTINGS_FILE, ...GENERATED_SECRETS.map((name) => join(SECRETS_DIR, name))].map(
    (file) => {
      const path = join(dir, file);
      return { file, contents: readFileSync(path, 'utf8'), mtime: statSync(path).mtimeMs };
    },
  );
}

/** The settings file as an environment, the way `env_file` passes it to a container. */
function parseEnvFile(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

afterEach(() => {
  for (const dir of directories.splice(0)) {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('quro init', () => {
  test('creates the settings file and one generated secret per role, never printing a value', () => {
    const dir = configDir();
    const run = init('--dir', dir);
    expect(run.exitCode).toBe(EXIT_OK);
    expect(mode(join(dir, SETTINGS_FILE))).toBe(0o644);
    expect(mode(join(dir, SECRETS_DIR))).toBe(0o700);
    for (const name of GENERATED_SECRETS) {
      const value = readFileSync(secretPath(dir, name), 'utf8');
      expect(value).toMatch(/^[0-9a-f]{48}\n$/);
      expect(mode(secretPath(dir, name))).toBe(0o600);
      expect(run.out).not.toContain(value.trim());
      expect(run.out).toContain(
        `Created ${secretPath(dir, name)} (generated, mode 0600; value not shown).`,
      );
    }
    const [admin, app] = GENERATED_SECRETS.map((name) =>
      readFileSync(secretPath(dir, name), 'utf8'),
    );
    expect(admin).not.toBe(app);
    // No temporary files are left behind.
    expect(readdirSync(dir).sort()).toEqual([SECRETS_DIR, SETTINGS_FILE].sort());
    expect(readdirSync(join(dir, SECRETS_DIR)).sort()).toEqual([...GENERATED_SECRETS].sort());
  });

  test('a second run changes nothing', () => {
    const dir = configDir();
    init('--dir', dir);
    const before = snapshot(dir);
    const run = init(`--dir=${dir}`);
    expect(run.exitCode).toBe(EXIT_OK);
    expect(run.out).toContain('Nothing to do');
    expect(run.out).not.toContain('Created');
    expect(snapshot(dir)).toEqual(before);
  });

  test('keeps an edited settings file and recreates only a missing secret', () => {
    const dir = configDir();
    init('--dir', dir);
    const settings = join(dir, SETTINGS_FILE);
    const edited = `${readFileSync(settings, 'utf8')}SECURE_COOKIES=true\n`;
    writeFileSync(settings, edited);
    const kept = readFileSync(secretPath(dir, GENERATED_SECRETS[0]), 'utf8');
    unlinkSync(secretPath(dir, GENERATED_SECRETS[1]));

    const run = init('--dir', dir);
    expect(run.exitCode).toBe(EXIT_OK);
    expect(run.out).toContain(`Kept ${settings} (exists; not changed).`);
    expect(readFileSync(settings, 'utf8')).toBe(edited);
    expect(readFileSync(secretPath(dir, GENERATED_SECRETS[0]), 'utf8')).toBe(kept);
    expect(readFileSync(secretPath(dir, GENERATED_SECRETS[1]), 'utf8')).toMatch(/^[0-9a-f]{48}\n$/);
  });

  test('--dry-run lists what it would create and writes nothing', () => {
    const dir = configDir();
    const run = init('--dir', dir, '--dry-run');
    expect(run.exitCode).toBe(EXIT_OK);
    expect(run.out).toContain(`Would create ${join(dir, SETTINGS_FILE)}.`);
    expect(run.out).toContain('Dry run: nothing was changed.');
    expect(readdirSync(dir)).toEqual([]);
  });

  test('refuses a missing directory (exit 2) and an unwritable one (exit 1) without writing', () => {
    expect(init('--dir', join(tmpdir(), 'quro-init-does-not-exist')).exitCode).toBe(EXIT_USAGE);
    const dir = configDir();
    chmodSync(dir, 0o500);
    const run = init('--dir', dir);
    expect(run.exitCode).toBe(EXIT_FAILURE);
    expect(run.out).toContain('not writable');
    expect(readdirSync(dir)).toEqual([]);
  });

  test('rejects unknown arguments', () => {
    expect(() => init('--force')).toThrow('Unknown argument: --force');
    expect(() => init('--dir')).toThrow('Missing value for --dir');
  });
});

describe('exclusive file creation', () => {
  test('never replaces a file that exists, even one created a moment earlier', () => {
    const dir = configDir();
    const path = join(dir, 'secret');
    expect(createFileExclusively(path, 'first\n', 0o600)).toBe(true);
    expect(createFileExclusively(path, 'second\n', 0o600)).toBe(false);
    expect(readFileSync(path, 'utf8')).toBe('first\n');
    expect(readdirSync(dir)).toEqual(['secret']);
  });
});

describe('the generated settings file', () => {
  const text = renderSettingsFile(new Date('2026-10-10T00:00:00Z'));
  const env = parseEnvFile(text);

  test('sets only settings the backend knows, with no secret value in it', () => {
    for (const name of Object.keys(env)) expect(Object.keys(SETTINGS)).toContain(name);
    expect(text).not.toMatch(/PASSWORD=(?!\/)/);
    expect(env.QRO_DOCUMENT_STORAGE).toBe('filesystem');
    expect(env.POSTGRES_HOST).toBe('db');
  });

  test('is a valid configuration for every process once the secret files exist', () => {
    const dir = configDir();
    init('--dir', dir);
    const files: Record<string, string> = {
      '/run/secrets/postgres_admin_password': secretPath(dir, 'postgres_admin_password'),
      '/run/secrets/postgres_app_password': secretPath(dir, 'postgres_app_password'),
    };
    const { problems } = loadConfig(env, (path) => readFileSync(files[path] ?? path, 'utf8'));
    for (const profile of ['server', 'migrate', 'cli', 'doctor'] as const) {
      const sections = PROFILES[profile] as readonly (keyof typeof problems)[];
      expect(sections.flatMap((section) => problems[section])).toEqual([]);
    }
  });
});

describe('the example Compose file and quro init agree', () => {
  type Service = { environment?: Record<string, string>; env_file?: string };
  const example = Bun.YAML.parse(
    readFileSync(join(import.meta.dir, '../../../../docs/compose.example.yaml'), 'utf8'),
  ) as { services: Record<string, Service>; secrets: Record<string, { file: string }> };
  const settings = parseEnvFile(renderSettingsFile());

  test('the secrets are the files quro init writes', () => {
    for (const name of GENERATED_SECRETS) {
      expect(example.secrets[name]?.file).toBe(`./config/${SECRETS_DIR}/${name}`);
    }
    expect(example.services.backend?.env_file).toBe(`./config/${SETTINGS_FILE}`);
  });

  test('the database service matches the generated settings', () => {
    const db = example.services[settings.POSTGRES_HOST!]?.environment;
    expect(db?.POSTGRES_USER).toBe(settings.POSTGRES_ADMIN_USER);
    expect(db?.POSTGRES_DB).toBe(settings.POSTGRES_DB);
  });
});
