import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCKER_FROM_BUN_RE = /^FROM\s+(?:--\S+\s+)*(\S*oven\/bun\S*)/i;
const BUN_IMAGE_RE =
  /^(?:docker\.io\/)?oven\/bun:(\d+\.\d+\.\d+)(?:-[\w.]+)?(?:@sha256:[a-f0-9]{64})?$/i;
const DOC_BUN_RE = /\bBun (\d+\.\d+\.\d+)\b/g;

export type BunVersionReference = { file: string; line: number; version: string };

export function findDockerfileReferences(file: string, content: string): BunVersionReference[] {
  return content.split('\n').flatMap((text, index) => {
    const from = DOCKER_FROM_BUN_RE.exec(text.trim());
    if (!from) return [];
    // Tags the guard cannot compare (latest, build args, bare names) are reported as mismatches.
    const version = BUN_IMAGE_RE.exec(from[1])?.[1] ?? `unverifiable image "${from[1]}"`;
    return [{ file, line: index + 1, version }];
  });
}

export function findDocReferences(file: string, content: string): BunVersionReference[] {
  return content.split('\n').flatMap((text, index) =>
    [...text.matchAll(DOC_BUN_RE)].map((match) => ({
      file,
      line: index + 1,
      version: match[1],
    })),
  );
}

export function findMismatches(
  expected: string,
  references: readonly BunVersionReference[],
): BunVersionReference[] {
  return references.filter((reference) => reference.version !== expected);
}

function listRepoFiles(root: string): string[] {
  // Tracked plus untracked-but-not-ignored files, so runtime data such as data/postgres is skipped.
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return output.split('\0').filter(Boolean);
}

function collectReferences(root: string): BunVersionReference[] {
  const references: BunVersionReference[] = [];
  for (const file of listRepoFiles(root)) {
    const name = file.split('/').pop() ?? '';
    const isDockerfile = name === 'Dockerfile' || name.startsWith('Dockerfile.');
    const isDoc = name.endsWith('.md') && (file.startsWith('docs/') || !file.includes('/'));
    if (!isDockerfile && !isDoc) continue;
    let content: string;
    try {
      content = readFileSync(join(root, file), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    references.push(
      ...(isDockerfile
        ? findDockerfileReferences(file, content)
        : findDocReferences(file, content)),
    );
  }
  return references;
}

export function checkBunVersion(root: string): string[] {
  const expected = readFileSync(join(root, '.bun-version'), 'utf8').trim();
  const references = collectReferences(root);
  const errors = findMismatches(expected, references).map(
    (r) =>
      `${r.file}:${r.line} uses ${/^\d/.test(r.version) ? `Bun ${r.version}` : r.version}, expected ${expected} (.bun-version)`,
  );
  if (!references.some((r) => r.file.endsWith('Dockerfile'))) {
    errors.push('No oven/bun Dockerfile references found; the check is not covering anything');
  }
  return errors;
}

if (import.meta.main) {
  const errors = checkBunVersion(join(import.meta.dir, '..'));
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('Bun version is consistent across .bun-version, Dockerfiles and docs.');
}
