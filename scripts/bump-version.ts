#!/usr/bin/env bun

import { readFile, writeFile } from 'node:fs/promises';
import { incrementVersion, formatVersion, ReleaseType } from './lib/version';

const releaseType = process.argv[2]?.toLowerCase() as ReleaseType | undefined;
const validTypes: ReleaseType[] = ['major', 'minor', 'patch', 'prerelease'];

if (!releaseType || !validTypes.includes(releaseType)) {
  console.error(
    `Usage: bun scripts/bump-version.ts <${validTypes.join('|')}>\n` +
      'Example: bun scripts/bump-version.ts minor',
  );
  process.exit(1);
}

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
