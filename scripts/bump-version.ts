#!/usr/bin/env bun

import { readFile, writeFile } from 'node:fs/promises';
import { incrementVersion, formatVersion, ReleaseType } from './lib/version';

const rawReleaseType = process.argv[2]?.toLowerCase();
const validTypes: ReleaseType[] = ['major', 'minor', 'patch', 'prerelease'];

function isReleaseType(value: string | undefined): value is ReleaseType {
  return validTypes.includes(value as ReleaseType);
}

if (!isReleaseType(rawReleaseType)) {
  console.error(
    `Usage: bun scripts/bump-version.ts <${validTypes.join('|')}>\n` +
      'Example: bun scripts/bump-version.ts minor',
  );
  process.exit(1);
}

const releaseType = rawReleaseType;

const VERSION_FILE = 'VERSION';

async function main() {
  const raw = (await readFile(VERSION_FILE, 'utf8')).trim();
  const next = incrementVersion(raw, releaseType);
  if (!next) {
    throw new Error(`VERSION is not valid semver: "${raw}"`);
  }

  const normalized = `${formatVersion(next)}`;
  await writeFile(VERSION_FILE, `${normalized}\n`);

  console.log(`Bumped version: ${raw} -> ${normalized}`);
  console.log('Remember to update CHANGELOG.md before opening your PR.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
