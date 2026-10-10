import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exampleTag, namedBlock, quickstartBlocks, substitute, toScript } from './commands';

const repo = join(import.meta.dir, '../..');
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

const SAMPLE = `Intro

\`\`\`bash
echo outside
\`\`\`

<!-- quickstart:begin -->

1. First:

   \`\`\`bash
   mkdir -p a && cd a
   \`\`\`

2. Linux:

   <!-- quickstart:linux-only -->

   \`\`\`bash
   sudo chown 1000:1000 a
   \`\`\`

   \`\`\`yaml
   not: shell
   \`\`\`

<!-- quickstart:end -->

<!-- quickstart:stop -->

\`\`\`bash
docker compose down
\`\`\`
`;

describe('extracting runnable blocks', () => {
  test('takes the shell blocks between the markers, without their list indentation', () => {
    expect(quickstartBlocks(SAMPLE)).toEqual([
      { lines: ['mkdir -p a && cd a'], linuxOnly: false },
      { lines: ['sudo chown 1000:1000 a'], linuxOnly: true },
    ]);
  });

  test('leaves Linux-only blocks out on other systems', () => {
    const blocks = quickstartBlocks(SAMPLE);
    expect(toScript(blocks, false)).toBe('set -eux\nmkdir -p a && cd a\n');
    expect(toScript(blocks, true)).toContain('sudo chown');
  });

  test('finds one named block and refuses a missing one', () => {
    expect(namedBlock(SAMPLE, 'stop').lines).toEqual(['docker compose down']);
    expect(() => namedBlock(SAMPLE, 'missing')).toThrow('found 0');
  });

  test('substitutes the release artifacts and refuses another version', () => {
    const options = { tag: 'v1.2.3', composeFile: '/repo/c.yaml', backendImage: 'quro:test' };
    const script =
      'curl -o c https://raw.githubusercontent.com/Pieter-OHearn/quro/v1.2.3/docs/compose.example.yaml\n' +
      'docker run ghcr.io/pieter-ohearn/quro-backend:v1.2.3 init\n';
    expect(substitute(script, options)).toBe(
      'curl -o c file:///repo/c.yaml\ndocker run quro:test init\n',
    );
    expect(() => substitute(script.replaceAll('v1.2.3', 'v1.2.2'), options)).toThrow('v1.2.2');
    expect(substitute(script, { ...options, composeFile: '/a b/c.yaml' })).toContain(
      'file:///a%20b/c.yaml',
    );
    expect(() =>
      substitute('docker pull ghcr.io/pieter-ohearn/quro-frontend:v1.2.3', options),
    ).toThrow('cannot substitute');
  });
});

describe('the README quickstart', () => {
  const readme = read('README.md');
  const blocks = quickstartBlocks(readme);
  const tag = exampleTag(read('docs/compose.example.yaml'));

  test('has the documented steps, with the Linux ownership step marked', () => {
    const commands = blocks.flatMap((block) => block.lines);
    expect(commands.some((line) => line.startsWith('curl '))).toBe(true);
    expect(commands.some((line) => line.endsWith(' init'))).toBe(true);
    expect(commands).toContain('docker compose up -d');
    expect(commands).toContain('docker compose exec backend quro user invite');
    expect(blocks.filter((block) => block.linuxOnly)).toEqual([
      { lines: ['sudo chown 1000:1000 config data/documents backups'], linuxOnly: true },
    ]);
  });

  test('downloads and runs the release the example Compose file pins', () => {
    const script = toScript(blocks, true);
    expect(() =>
      substitute(script, { tag, composeFile: '/c.yaml', backendImage: 'quro-backend:test' }),
    ).not.toThrow();
  });

  test('the install guide names the same release', () => {
    const guide = read('docs/install.md');
    for (const match of guide.matchAll(/quro\/(v[^/\s]+)\/docs\/compose\.example\.yaml/g)) {
      expect(match[1]).toBe(tag);
    }
    for (const match of guide.matchAll(/quro-(?:backend|frontend):(v[\w.-]+)/g)) {
      expect(match[1]).toBe(tag);
    }
  });

  test('the uninstall page marks its two Compose commands', () => {
    const page = read('docs/uninstall.md');
    expect(namedBlock(page, 'uninstall-keep').lines).toEqual(['docker compose down']);
    expect(namedBlock(page, 'uninstall-delete').lines).toEqual(['docker compose down --volumes']);
  });
});
