import { randomBytes } from 'node:crypto';
import {
  accessSync,
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { settingsManifest, type ManifestEntry } from '../config/manifest';
import { SETTINGS } from '../config/settings';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, UsageError, type CommandIo } from './io';

// `quro init` prepares a configuration directory: one settings file and a generated password
// file per database role. It only ever creates missing files. An existing file is never opened
// for writing, so edits survive any number of runs, and secret values are never printed.

export const DEFAULT_CONFIG_DIR = '/config';
export const SETTINGS_FILE = 'quro.env';
export const SECRETS_DIR = 'secrets';
export const GENERATED_SECRETS = ['postgres_admin_password', 'postgres_app_password'] as const;

const SECRET_BYTES = 24;
const SECRET_FILE_MODE = 0o600;
const SECRETS_DIR_MODE = 0o700;
const SETTINGS_FILE_MODE = 0o644;

export const INIT_USAGE = `Usage: quro init [--dir <path>] [--dry-run]

Writes a settings file (${SETTINGS_FILE}) and one generated password file per database role
(${SECRETS_DIR}/${GENERATED_SECRETS.join(`, ${SECRETS_DIR}/`)}) into a mounted directory.
Creates only missing files and never changes an existing one. Secret values are never printed.

Options:
  --dir <path>   Configuration directory (default ${DEFAULT_CONFIG_DIR}); it must exist
  --dry-run      List the files that would be created, change nothing`;

// The settings a new install sets explicitly; they match the example Compose file.
const EXPLICIT_SETTINGS: ReadonlyArray<[string, string, string?]> = [
  ['POSTGRES_HOST', 'db', 'Database host: `db` is the service in the example Compose file.'],
  ['POSTGRES_PORT', '5432'],
  ['POSTGRES_DB', 'quro'],
  ['POSTGRES_ADMIN_USER', 'quro_admin', 'Owner role: migrations, backup and restore.'],
  ['POSTGRES_APP_USER', 'quro_app', 'Runtime role, created by `quro migrate`.'],
  ['QRO_DOCUMENT_STORAGE', 'filesystem', 'Documents are files under QRO_DOCUMENTS_DIR.'],
  ['SECURE_COOKIES', 'false', 'Set to true when browsers reach Quro over HTTPS.'],
  ['QRO_REGISTRATION_MODE', 'invite'],
  ['TRUSTED_PROXIES', '172.16.0.0/12', "Docker's default range: the bundled nginx."],
];

// Per-run switches and development settings do not belong in a settings file.
const EXCLUDED_GROUPS = new Set(['Maintenance', 'Demo data']);

const COMMENT_WIDTH = 96;

/** Wraps text into `# ` comment lines. */
function commentLines(text: string): string[] {
  const lines: string[] = [];
  let line = '#';
  for (const word of text.split(/\s+/)) {
    if (line.length + word.length + 1 > COMMENT_WIDTH && line !== '#') {
      lines.push(line);
      line = '#';
    }
    line += ` ${word}`;
  }
  return [...lines, line];
}

function defaultValue(entry: ManifestEntry): string {
  if (entry.example) return entry.example;
  const value: unknown = SETTINGS[entry.name].default;
  if (Array.isArray(value)) return value.join(',');
  return value === undefined ? '' : String(value);
}

function optionalSetting(entry: ManifestEntry): string[] {
  return [...commentLines(entry.description), `# ${entry.name}=${defaultValue(entry)}`, ''];
}

/** The settings file a new install starts from. Contains no secret value. */
export function renderSettingsFile(now = new Date()): string {
  const explicit = new Set(EXPLICIT_SETTINGS.map(([name]) => name));
  const lines = [
    `# Quro settings, written by \`quro init\` on ${now.toISOString().slice(0, 10)}.`,
    '# Edit freely: `quro init` never changes this file. Passwords live in the secrets directory',
    '# next to it, never here. Every setting is described in docs/configuration.md.',
    '',
  ];
  for (const [name, value, note] of EXPLICIT_SETTINGS) {
    if (note) lines.push(...commentLines(note));
    lines.push(`${name}=${value}`, '');
  }
  lines.push('# Optional settings. Uncomment a line to change it from its default.', '');
  const optional = settingsManifest().filter(
    (entry) =>
      entry.audience === 'operator' &&
      entry.secret !== 'value' &&
      !explicit.has(entry.name) &&
      !EXCLUDED_GROUPS.has(entry.group),
  );
  for (const entry of optional) lines.push(...optionalSetting(entry));
  return `${lines.join('\n').trimEnd()}\n`;
}

export function generateSecret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

/**
 * Creates `path` with `contents` unless something exists there. The bytes go to a temporary file
 * that is linked into place, so the file never exists half written and a concurrent run cannot
 * replace it. Returns false when the file already existed.
 */
export function createFileExclusively(path: string, contents: string, mode: number): boolean {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    linkSync(temporary, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    unlinkSync(temporary);
  }
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function parseInitArgs(args: readonly string[]): { dir: string; dryRun: boolean } {
  let dir = DEFAULT_CONFIG_DIR;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new UsageError('Missing value for --dir');
      dir = value;
      index += 1;
    } else if (arg.startsWith('--dir=')) dir = arg.slice('--dir='.length);
    else throw new UsageError(`Unknown argument: ${arg}`);
  }
  if (!dir) throw new UsageError('Missing value for --dir');
  return { dir: resolve(dir), dryRun };
}

type PlannedFile = { path: string; kind: 'settings' | 'secret' };

function plannedFiles(dir: string): PlannedFile[] {
  return [
    { path: join(dir, SETTINGS_FILE), kind: 'settings' },
    ...GENERATED_SECRETS.map((name) => ({
      path: join(dir, SECRETS_DIR, name),
      kind: 'secret' as const,
    })),
  ];
}

function checkDirectory(dir: string, io: CommandIo): number | null {
  let isDirectory = false;
  try {
    isDirectory = statSync(dir).isDirectory();
  } catch {
    // Reported below.
  }
  if (!isDirectory) {
    io.err(
      `The configuration directory ${dir} does not exist. Mount a directory there or pass --dir.`,
    );
    return EXIT_USAGE;
  }
  try {
    accessSync(dir, constants.W_OK | constants.X_OK);
  } catch {
    io.err(
      `The configuration directory ${dir} is not writable by UID ${process.getuid?.() ?? 'unknown'}. Give it to that user (chown) or run with --user set to its owner; see "File ownership" in docs/install-contract.md.`,
    );
    return EXIT_FAILURE;
  }
  return null;
}

function createFile(file: PlannedFile): boolean {
  if (file.kind === 'settings') {
    return createFileExclusively(file.path, renderSettingsFile(), SETTINGS_FILE_MODE);
  }
  return createFileExclusively(file.path, `${generateSecret()}\n`, SECRET_FILE_MODE);
}

function ensureSecretsDirectory(dir: string, io: CommandIo) {
  const secrets = join(dir, SECRETS_DIR);
  if (exists(secrets)) return;
  mkdirSync(secrets, { mode: SECRETS_DIR_MODE });
  io.out(`Created ${secrets}/ (mode 0700).`);
}

function createMissingFiles(dir: string, missing: readonly PlannedFile[], io: CommandIo) {
  if (missing.some((file) => file.kind === 'secret')) ensureSecretsDirectory(dir, io);
  for (const file of missing) {
    const created = createFile(file);
    const detail = file.kind === 'secret' ? ' (generated, mode 0600; value not shown)' : '';
    io.out(created ? `Created ${file.path}${detail}.` : `Kept ${file.path} (exists; not changed).`);
  }
}

export function runInitCommand(args: readonly string[], io: CommandIo): number {
  if (args.includes('--help')) {
    io.out(INIT_USAGE);
    return EXIT_OK;
  }
  const { dir, dryRun } = parseInitArgs(args);
  const refused = checkDirectory(dir, io);
  if (refused !== null) return refused;

  const files = plannedFiles(dir);
  const missing = files.filter((file) => !exists(file.path));
  for (const file of files.filter((candidate) => !missing.includes(candidate))) {
    io.out(`Kept ${file.path} (exists; not changed).`);
  }
  if (dryRun) {
    for (const file of missing) io.out(`Would create ${file.path}.`);
    io.out('Dry run: nothing was changed.');
    return EXIT_OK;
  }
  createMissingFiles(dir, missing, io);
  io.out(
    missing.length === 0
      ? 'Nothing to do: the configuration directory is complete.'
      : `Review ${join(dir, SETTINGS_FILE)}, then run \`quro migrate\`.`,
  );
  return EXIT_OK;
}
