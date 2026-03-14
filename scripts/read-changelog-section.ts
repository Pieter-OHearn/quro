#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';

const version = process.argv[2];

if (!version) {
  console.error('Usage: bun scripts/read-changelog-section.ts <version>');
  process.exit(1);
}

async function main() {
  const changelog = await readFile('CHANGELOG.md', 'utf8');
  const pattern = new RegExp(`^##\\s*\\[?${version}\\]?[^\\n]*$`, 'm');
  const match = changelog.match(pattern);
  if (!match || match.index === undefined) {
    throw new Error(`Could not find changelog section for ${version}`);
  }

  const start = match.index + match[0].length;
  const rest = changelog.slice(start);
  const nextHeadingIndex = rest.search(/^##\s*\[/m);
  const section = nextHeadingIndex === -1 ? rest.trim() : rest.slice(0, nextHeadingIndex).trim();

  console.log(match[0].trim());
  if (section) {
    console.log('');
    console.log(section);
  } else {
    console.log('');
    console.log('_No additional notes supplied yet._');
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
