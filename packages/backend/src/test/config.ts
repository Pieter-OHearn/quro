import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reloadConfig } from '../config';

// Helpers for tests that change settings. The application parses its configuration once at boot,
// so a test that changes `process.env` asks for a fresh parse afterwards.

type Settings = Record<string, string | undefined>;

let secretsDirectory: string | undefined;

/** Writes a synthetic secret file and returns its path. */
export function writeTestSecret(name: string, value: string): string {
  secretsDirectory ??= mkdtempSync(join(tmpdir(), 'quro-test-secrets-'));
  const path = join(secretsDirectory, name);
  writeFileSync(path, `${value}\n`, { mode: 0o600 });
  return path;
}

const SECRETS_KEY_BYTES = 32;

/** A random secrets key in the format QRO_SECRETS_KEY_FILE requires. Synthetic; never reused. */
export function generateTestSecretsKey(): string {
  return randomBytes(SECRETS_KEY_BYTES).toString('hex');
}

let secretsKeyFile: string | undefined;

/** A secrets key file for tests that configure bunq, created once per test process. */
export function testSecretsKeyFile(): string {
  secretsKeyFile ??= writeTestSecret('secrets_key', generateTestSecretsKey());
  return secretsKeyFile;
}

/**
 * Sets (or, for `undefined`, removes) environment settings and re-parses the configuration.
 * Returns a function that restores the previous values and re-parses again.
 */
export function applyTestSettings(settings: Settings): () => void {
  const previous = Object.fromEntries(
    Object.keys(settings).map((name) => [name, process.env[name]]),
  );
  const write = (values: Settings) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    reloadConfig();
  };
  write(settings);
  return () => write(previous);
}

let documentsDirectory: string | undefined;

/** A temporary documents directory for the filesystem store, removed when the process exits. */
export function testDocumentsDirectory(): string {
  if (!documentsDirectory) {
    const directory = mkdtempSync(join(tmpdir(), 'quro-test-documents-'));
    process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
    documentsDirectory = directory;
  }
  return documentsDirectory;
}

/**
 * Documents in a temporary directory and a synthetic parser address, so statement import counts
 * as configured. Tests that inspect stored objects replace the store (see providerMocks.ts).
 */
export function documentAndImportSettings(): Settings {
  return {
    QRO_DOCUMENT_STORAGE: 'filesystem',
    QRO_DOCUMENTS_DIR: testDocumentsDirectory(),
    PENSION_PARSER_URL: 'http://parser.test.invalid:8080',
  };
}
