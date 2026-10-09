import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDocs, headingSlugs, parseMarkdown, type DocsRepo } from './check-docs';

// Synthetic fixture repository: every path, script and variable below is invented for the tests.
function fixtureRepo(docs: Record<string, string>, extraFiles: string[] = []): DocsRepo {
  const files = new Set([
    ...Object.keys(docs),
    ...extraFiles,
    'package.json',
    'packages/backend/package.json',
    'packages/backend/src/lib/thing.ts',
    'docs/guide.md',
  ]);
  const dirs = new Set(
    [...files].flatMap((path) => {
      const parts = path.split('/');
      return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join('/'));
    }),
  );
  const texts: Record<string, string> = {
    'docs/guide.md': '# Guide\n\n## Set up\n\n## Set up\n',
    ...docs,
  };
  return {
    markdownFiles: Object.keys(docs).filter((path) => path.endsWith('.md')),
    readText: (path) => texts[path] ?? '',
    exists: (path) => files.has(path) || dirs.has(path),
    isIgnored: (path) => path.startsWith('data/') || path.endsWith('.env'),
    scripts: new Map([
      ['.', new Set(['test', 'docs:check'])],
      ['packages/backend', new Set(['db:generate', 'start'])],
    ]),
    packageDirs: new Map([['@quro/backend', 'packages/backend']]),
    configCorpus: 'const url = process.env.FIXTURE_DATABASE_URL;\nFIXTURE_PORT=3000\n',
  };
}

const messages = (docs: Record<string, string>, extraFiles?: string[]) =>
  checkDocs(fixtureRepo(docs, extraFiles)).map((problem) => `${problem.line}: ${problem.message}`);

describe('headingSlugs', () => {
  test('matches GitHub anchors, including punctuation and duplicates', () => {
    expect([
      ...headingSlugs([
        '6. The @quro/shared Package',
        'Local Docker Dev',
        '`bun run` and [links](x.md)',
        'Set up',
        'Set up',
      ]),
    ]).toEqual([
      '6-the-quroshared-package',
      'local-docker-dev',
      'bun-run-and-links',
      'set-up',
      'set-up-1',
    ]);
  });

  test('a fence line with an info string does not close an open block', () => {
    const parsed = parseMarkdown('````md\n```bash\n# inside\n```\n````\n# After\n');
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.headings).toEqual(['After']);
  });

  test('ignores headings inside fenced code', () => {
    expect(parseMarkdown('# Real\n\n```bash\n# not a heading\n```\n').headings).toEqual(['Real']);
  });
});

describe('checkDocs links', () => {
  test('accepts existing files, anchors, directories and external links', () => {
    expect(
      messages({
        'docs/a.md': [
          '[guide](guide.md) [anchor](guide.md#set-up-1) [self](#a) [dir](../packages/backend/)',
          '[web](https://example.invalid/missing) [mail](mailto:someone@example.invalid)',
          '# A',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  test('reports a missing file, a missing anchor and a path outside the repository', () => {
    expect(
      messages({
        'docs/a.md': '[gone](missing.md)\n[anchor](guide.md#nope)\n[out](../../outside.md)\n',
      }),
    ).toEqual([
      '1: link missing.md points to a missing file',
      '2: link guide.md#nope has no matching heading',
      '3: link ../../outside.md points outside the repository',
    ]);
  });

  test('ignores links inside fenced and inline code', () => {
    expect(
      messages({ 'docs/a.md': '```md\n[gone](missing.md)\n```\n`[gone](missing.md)`\n' }),
    ).toEqual([]);
  });
});

describe('checkDocs paths', () => {
  test('reports a missing repository path and resolves src/ paths inside packages', () => {
    expect(
      messages({
        'docs/a.md':
          'See `packages/backend/src/lib/thing.ts`, `src/lib/thing.ts` and `packages/backend/src/gone.ts`.\n' +
          'Also `src/lib/missing.ts`.\n',
      }),
    ).toEqual([
      '1: path packages/backend/src/gone.ts does not exist',
      '2: path src/lib/missing.ts does not exist',
    ]);
  });

  test('skips fragments, ignored files, placeholders and declared skip-paths', () => {
    expect(
      messages({
        'docs/a.md': [
          '<!-- docs:check skip-paths: packages/backend/src/routes/example, scripts/built.js -->',
          '`hooks/index.ts` `data/postgres` `packages/backend/.env` `packages/<name>/x.ts`',
          '`packages/backend/src/routes/example.ts` `scripts/built.js` `/var/run/socket`',
        ].join('\n'),
      }),
    ).toEqual([]);
  });
});

describe('checkDocs commands and config', () => {
  test('checks bun run script names against the right package', () => {
    expect(
      messages({
        'docs/a.md': [
          '```bash',
          'bun run test',
          'bun run nope',
          "bun run --filter '@quro/backend' start",
          "bun run --filter '@quro/backend' nope",
          "bun run --filter '@quro/missing' start",
          'bun run scripts/tool.ts',
          '# bun run commented-out',
          '```',
          'Inline `bun run docs:check` and `bun run missing-inline`.',
        ].join('\n'),
      }),
    ).toEqual([
      '3: bun run nope: no such script in the root package.json',
      '5: bun run nope: no such script in @quro/backend',
      '6: bun run --filter @quro/missing: no such workspace',
      '10: bun run missing-inline: no such script in the root package.json',
    ]);
  });

  test('a block that names a package accepts that package’s scripts', () => {
    expect(
      messages({ 'docs/a.md': '```bash\n# from packages/backend\nbun run db:generate\n```\n' }),
    ).toEqual([]);
    expect(messages({ 'docs/a.md': '```bash\nbun run db:generate\n```\n' })).toEqual([
      '2: bun run db:generate: no such script in the root package.json',
    ]);
  });

  test('reports environment variables that nothing in the repository reads', () => {
    expect(
      messages({
        'docs/a.md': [
          '```bash',
          'export FIXTURE_DATABASE_URL=postgres://example FIXTURE_TYPO=1',
          'FIXTURE_PORT=3001 bun run test',
          '```',
          '```ts',
          'NOT_SHELL=1',
          '```',
        ].join('\n'),
      }),
    ).toEqual(['2: config FIXTURE_TYPO is not used anywhere in the repository']);
  });

  test('checks only links in the changelog', () => {
    expect(
      messages({
        'CHANGELOG.md':
          '- removed `packages/backend/src/old.ts` and `bun run old`\n- [gone](gone.md)\n',
      }),
    ).toEqual(['2: link gone.md points to a missing file']);
  });
});

describe('docs:check command', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { force: true, recursive: true });
  });

  function fixtureCheckout(doc: string): string {
    const root = mkdtempSync(join(tmpdir(), 'quro-docs-check-'));
    directories.push(root);
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'docs'));
    copyFileSync(join(import.meta.dir, 'check-docs.ts'), join(root, 'scripts', 'check-docs.ts'));
    writeFileSync(
      join(root, 'package.json'),
      '{"name":"fixture","private":true,"scripts":{"test":"true"}}\n',
    );
    writeFileSync(join(root, 'docs', 'index.md'), doc);
    writeFileSync(join(root, 'docs', 'other.md'), '# Other\n');
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    return root;
  }

  const run = (root: string) =>
    spawnSync(process.execPath, ['--no-env-file', join(root, 'scripts', 'check-docs.ts')], {
      cwd: root,
      encoding: 'utf8',
    });

  test('passes a consistent checkout', () => {
    const result = run(fixtureCheckout('[other](other.md#other)\n\n```bash\nbun run test\n```\n'));
    expect(result.status).toBe(0);
  });

  test('fails an intentionally broken example with file and line', () => {
    const result = run(
      fixtureCheckout('# Index\n\n[other](other.md#missing)\n\n```bash\nbun run tset\n```\n'),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'docs/index.md:3: link other.md#missing has no matching heading',
    );
    expect(result.stderr).toContain(
      'docs/index.md:6: bun run tset: no such script in the root package.json',
    );
  });
});
