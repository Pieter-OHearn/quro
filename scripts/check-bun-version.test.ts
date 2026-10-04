import { describe, expect, test } from 'bun:test';
import { findDocReferences, findDockerfileReferences, findMismatches } from './check-bun-version';

describe('check-bun-version', () => {
  test('parses Dockerfile base images including variants and stages', () => {
    const refs = findDockerfileReferences(
      'Dockerfile',
      'FROM oven/bun:1.4.2-debian AS build\nFROM nginx:1.28\nFROM --platform=linux/amd64 oven/bun:1.3.10',
    );
    expect(refs.map((r) => r.version)).toEqual(['1.4.2', '1.3.10']);
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
