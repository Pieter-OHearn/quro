import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkBunVersion,
  findDocReferences,
  findDockerfileReferences,
  findMismatches,
} from './check-bun-version';

describe('check-bun-version', () => {
  test('parses Dockerfile base images including variants and stages', () => {
    const refs = findDockerfileReferences(
      'Dockerfile',
      'FROM oven/bun:1.4.2-debian AS build\nFROM nginx:1.30.3\nFROM --platform=linux/amd64 oven/bun:1.3.10',
    );
    expect(refs.map((r) => r.version)).toEqual(['1.4.2', '1.3.10']);
  });

  test('accepts digest-qualified tags and flags unverifiable Bun references', () => {
    const digest = 'a'.repeat(64);
    const refs = findDockerfileReferences(
      'Dockerfile',
      [
        `FROM oven/bun:1.4.2@sha256:${digest}`,
        'FROM oven/bun:latest',
        'FROM oven/bun:${BUN_VERSION}',
        'FROM oven/bun',
      ].join('\n'),
    );
    expect(refs[0].version).toBe('1.4.2');
    expect(findMismatches('1.4.2', refs)).toHaveLength(3);
  });

  test('ignores unreadable runtime data directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'bun-version-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      writeFileSync(join(root, '.bun-version'), '1.4.2\n');
      writeFileSync(join(root, '.gitignore'), 'data/\n');
      writeFileSync(join(root, 'Dockerfile'), 'FROM oven/bun:1.4.2\n');
      mkdirSync(join(root, 'data/postgres'), { recursive: true });
      writeFileSync(join(root, 'data/postgres/Dockerfile'), 'FROM oven/bun:1.0.0\n');
      chmodSync(join(root, 'data/postgres'), 0o000);
      expect(checkBunVersion(root)).toEqual([]);
    } finally {
      chmodSync(join(root, 'data/postgres'), 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('parses doc mentions', () => {
    const refs = findDocReferences('docs/x.md', '- Bun 1.4.2 required\nBun 1.x is ignored');
    expect(refs).toEqual([{ file: 'docs/x.md', line: 1, version: '1.4.2' }]);
  });

  test('reports only references that differ from the expected version', () => {
    const refs = [
      { file: 'a', line: 1, version: '1.4.2' },
      { file: 'b', line: 1, version: '1.3.10' },
    ];
    expect(findMismatches('1.4.2', refs)).toEqual([refs[1]]);
  });
});
