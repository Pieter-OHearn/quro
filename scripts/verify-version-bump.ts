#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { compareVersions, parseVersion } from './lib/version';

const VERSION_FILE = 'VERSION';
const baseRef = process.argv[2]?.trim();

function readVersionFromGit(ref: string): string | null {
  try {
    const result = execSync(`git show ${ref}:${VERSION_FILE}`, { encoding: 'utf8' });
    return result.trim();
  } catch {
    return null;
  }
}

function getLatestTag(): string | null {
  try {
    const tag = execSync(`git tag --list 'v*' --sort=-version:refname | head -n1`, {
      encoding: 'utf8',
    }).trim();
    return tag || null;
  } catch {
    return null;
  }
}

async function main() {
  const currentRaw = (await readFile(VERSION_FILE, 'utf8')).trim();
  const currentParsed = parseVersion(currentRaw);
  if (!currentParsed) {
    throw new Error(`VERSION must be valid semver (vX.Y.Z). Found: ${currentRaw}`);
  }

  if (baseRef) {
    const previousRaw = readVersionFromGit(baseRef);
    if (previousRaw) {
      if (previousRaw === currentRaw) {
        throw new Error(
          `VERSION was not updated. Base ref ${baseRef} also reports ${previousRaw}.`,
        );
      }
      if (compareVersions(currentRaw, previousRaw) <= 0) {
        throw new Error(
          `VERSION must increase relative to ${previousRaw}. Proposed: ${currentRaw}.`,
        );
      }
    }
  }

  const latestTag = getLatestTag();
  if (latestTag && compareVersions(currentRaw, latestTag) <= 0) {
    throw new Error(`VERSION (${currentRaw}) must be greater than latest tag (${latestTag}).`);
  }

  console.log(`VERSION OK: ${currentRaw}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
