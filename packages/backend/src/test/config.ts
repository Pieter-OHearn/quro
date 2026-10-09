import { mkdtempSync, writeFileSync } from 'node:fs';
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

/** Synthetic S3 and parser settings: document storage and statement import count as configured. */
export function documentAndImportSettings(): Settings {
  return {
    S3_ENDPOINT: 'http://s3.test.invalid:9000',
    S3_REGION: 'test-region',
    S3_BUCKET: 'quro-test-documents',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY_FILE: writeTestSecret('s3_secret_access_key', 'test-secret-key'),
    PENSION_PARSER_URL: 'http://parser.test.invalid:8080',
  };
}
