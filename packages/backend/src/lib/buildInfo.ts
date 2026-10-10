import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUNDLED_MIGRATIONS, latestBundledMigration } from '../db/schemaVersion';

// What this build is: the application version (the repository's VERSION file), the newest
// migration it ships and the commit the image was built from. The backend image copies VERSION
// to /app/VERSION and writes the build's commit to /app/REVISION; a checkout has no REVISION.

const APP_ROOT = resolve(import.meta.dir, '../../../..');

export type BuildInfo = {
  version: string;
  revision: string;
  migrations: { latest: string; count: number };
  runtime: { bun: string; platform: string; arch: string };
};

function readTrimmed(name: string): string | null {
  try {
    const value = readFileSync(resolve(APP_ROOT, name), 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

export function getBuildInfo(): BuildInfo {
  return {
    version: readTrimmed('VERSION') ?? 'unknown',
    revision: readTrimmed('REVISION') ?? 'unknown',
    migrations: { latest: latestBundledMigration().tag, count: BUNDLED_MIGRATIONS.length },
    runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
  };
}
