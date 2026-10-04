import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);
const DOCKER_BUN_RE = /^FROM\s+(?:--\S+\s+)*oven\/bun:(\d+\.\d+\.\d+)(?:-\S+)?(?:\s|$)/i;
const DOC_BUN_RE = /\bBun (\d+\.\d+\.\d+)\b/g;

export type BunVersionReference = { file: string; line: number; version: string };

export function findDockerfileReferences(file: string, content: string): BunVersionReference[] {
  return content.split('\n').flatMap((text, index) => {
    const match = DOCKER_BUN_RE.exec(text.trim());
    return match ? [{ file, line: index + 1, version: match[1] }] : [];
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

function walk(dir: string, visit: (path: string) => void): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, visit);
    else visit(path);
  }
}

function collectReferences(root: string): BunVersionReference[] {
  const references: BunVersionReference[] = [];
  walk(root, (path) => {
    const name = path.split('/').pop() ?? '';
    const file = relative(root, path);
    const isDockerfile = name === 'Dockerfile' || name.startsWith('Dockerfile.');
    const isDoc = name.endsWith('.md') && (file.startsWith('docs/') || !file.includes('/'));
    if (!isDockerfile && !isDoc) return;
    const content = readFileSync(path, 'utf8');
    references.push(
      ...(isDockerfile
        ? findDockerfileReferences(file, content)
        : findDocReferences(file, content)),
    );
  });
  return references;
}

export function checkBunVersion(root: string): string[] {
  const expected = readFileSync(join(root, '.bun-version'), 'utf8').trim();
  const references = collectReferences(root);
  const errors = findMismatches(expected, references).map(
    (r) => `${r.file}:${r.line} uses Bun ${r.version}, expected ${expected} (.bun-version)`,
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
