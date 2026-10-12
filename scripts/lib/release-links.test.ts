import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { absoluteRepositoryLinks, type LinkBase } from './release-links';
import { changelogSection } from './release-gate';

const BASE: LinkBase = {
  origin: 'https://github.com',
  repository: 'acme/quro',
  tag: 'v0.9.0',
};
const BLOB = 'https://github.com/acme/quro/blob/v0.9.0';
const RAW = 'https://github.com/acme/quro/raw/v0.9.0';

const rewrite = (markdown: string) => absoluteRepositoryLinks(markdown, BASE);

describe('absoluteRepositoryLinks', () => {
  test('pins a relative file link to the tag', () => {
    expect(rewrite('See [the guide](docs/upgrade.md).')).toBe(
      `See [the guide](${BLOB}/docs/upgrade.md).`,
    );
    expect(rewrite('[Install](docs/install.md) and [config](docs/configuration.md)')).toBe(
      `[Install](${BLOB}/docs/install.md) and [config](${BLOB}/docs/configuration.md)`,
    );
  });

  test('keeps the anchor and the query of a link', () => {
    expect(rewrite('[Details](docs/upgrade.md#auth-json-only)')).toBe(
      `[Details](${BLOB}/docs/upgrade.md#auth-json-only)`,
    );
    expect(rewrite('[Readme](README.md?plain=1#quickstart)')).toBe(
      `[Readme](${BLOB}/README.md?plain=1#quickstart)`,
    );
  });

  test('resolves ./ and ../ against the repository root and treats a leading slash as the root', () => {
    expect(rewrite('[a](./docs/a.md) [b](docs/../README.md) [c](/docs/c.md)')).toBe(
      `[a](${BLOB}/docs/a.md) [b](${BLOB}/README.md) [c](${BLOB}/docs/c.md)`,
    );
    expect(rewrite('[dir](docs/)')).toBe(`[dir](${BLOB}/docs/)`);
  });

  test('leaves anchors, external, mail and protocol-relative links alone', () => {
    const untouched = [
      '[top](#changelog)',
      '[site](https://semver.org/)',
      '[plain](http://example.test/a.md)',
      '[mail](mailto:team@example.test)',
      '[proto](//example.test/a.md)',
      '[empty]()',
      '[query](?tab=1)',
      '<https://example.test/docs/a.md>',
    ].join('\n');
    expect(rewrite(untouched)).toBe(untouched);
  });

  test('leaves a link already pinned to the tag and a link out of the repository alone', () => {
    const pinned = `[notes](${BLOB}/docs/upgrade.md#how-upgrades-work) [rel](https://github.com/acme/quro/releases/tag/v0.9.0)`;
    expect(rewrite(pinned)).toBe(pinned);
    expect(rewrite('[up](../outside.md) [more](docs/../../outside.md)')).toBe(
      '[up](../outside.md) [more](docs/../../outside.md)',
    );
  });

  test('pins an image to the raw file and a linked image to both', () => {
    expect(rewrite('![Dark mode](docs/screens/dark.png)')).toBe(
      `![Dark mode](${RAW}/docs/screens/dark.png)`,
    );
    expect(rewrite('[![Dark](docs/screens/dark.png)](docs/design.md#dark)')).toBe(
      `[![Dark](${RAW}/docs/screens/dark.png)](${BLOB}/docs/design.md#dark)`,
    );
    expect(rewrite('![external](https://example.test/a.png)')).toBe(
      '![external](https://example.test/a.png)',
    );
  });

  test('keeps a title, an angle-bracket destination and parentheses in a path', () => {
    expect(rewrite('[a](docs/a.md "The guide")')).toBe(`[a](${BLOB}/docs/a.md "The guide")`);
    expect(rewrite("[a](docs/a.md 'The guide' )")).toBe(`[a](${BLOB}/docs/a.md 'The guide' )`);
    expect(rewrite('[a](<docs/my guide.md#top>)')).toBe(`[a](<${BLOB}/docs/my%20guide.md#top>)`);
    expect(rewrite('[a](docs/a_(old).md)')).toBe(`[a](${BLOB}/docs/a_(old).md)`);
    expect(rewrite('(see [a](docs/a.md))')).toBe(`(see [a](${BLOB}/docs/a.md))`);
  });

  test('rewrites links in list items, bold text, tables and across wrapped lines', () => {
    const input = [
      '- **Removed.** Stop the updater first. [Details](docs/upgrade.md#removed)',
      '- a [wrapped',
      '  label](docs/wrapped.md) here',
      '',
      '| Name | Link |',
      '| ---- | ---- |',
      '| One | [docs](docs/one.md) |',
    ].join('\n');
    expect(rewrite(input)).toBe(
      [
        `- **Removed.** Stop the updater first. [Details](${BLOB}/docs/upgrade.md#removed)`,
        '- a [wrapped',
        `  label](${BLOB}/docs/wrapped.md) here`,
        '',
        '| Name | Link |',
        '| ---- | ---- |',
        `| One | [docs](${BLOB}/docs/one.md) |`,
      ].join('\n'),
    );
  });

  test('leaves links inside code spans alone and rewrites the links around them', () => {
    expect(rewrite('Write `[Details](docs/upgrade.md)` as [a](docs/a.md).')).toBe(
      `Write \`[Details](docs/upgrade.md)\` as [a](${BLOB}/docs/a.md).`,
    );
    expect(rewrite('Use ``[x](docs/x.md) with a ` tick`` or [y](docs/y.md)')).toBe(
      `Use \`\`[x](docs/x.md) with a \` tick\`\` or [y](${BLOB}/docs/y.md)`,
    );
    // A code span in a label does not hide the link that follows it.
    expect(rewrite('[`quro migrate`](docs/upgrade.md#migrate)')).toBe(
      `[\`quro migrate\`](${BLOB}/docs/upgrade.md#migrate)`,
    );
  });

  test('treats an unclosed backtick as text, and never pairs ticks across paragraphs', () => {
    expect(rewrite('a ` tick and [x](docs/x.md)')).toBe(`a \` tick and [x](${BLOB}/docs/x.md)`);
    expect(rewrite('open `tick\n\n[x](docs/x.md) close`')).toBe(
      `open \`tick\n\n[x](${BLOB}/docs/x.md) close\``,
    );
  });

  test('leaves fenced code blocks alone', () => {
    const input = [
      'Before [a](docs/a.md)',
      '',
      '```md',
      '[Details](docs/upgrade.md)',
      '```',
      '',
      '~~~~',
      '[Tilde](docs/tilde.md)',
      '~~~',
      '[Still code](docs/code.md)',
      '~~~~',
      '',
      '````',
      '```',
      '[Nested](docs/nested.md)',
      '```',
      '````',
      '',
      'After [b](docs/b.md)',
    ].join('\n');
    expect(rewrite(input)).toBe(
      [
        `Before [a](${BLOB}/docs/a.md)`,
        '',
        '```md',
        '[Details](docs/upgrade.md)',
        '```',
        '',
        '~~~~',
        '[Tilde](docs/tilde.md)',
        '~~~',
        '[Still code](docs/code.md)',
        '~~~~',
        '',
        '````',
        '```',
        '[Nested](docs/nested.md)',
        '```',
        '````',
        '',
        `After [b](${BLOB}/docs/b.md)`,
      ].join('\n'),
    );
  });

  test('leaves an indented fence inside a list item alone', () => {
    const input = [
      '- Run:',
      '',
      '    ```sh',
      '    cat [x](docs/x.md)',
      '    ```',
      '- [y](docs/y.md)',
    ];
    expect(rewrite(input.join('\n'))).toBe(
      [...input.slice(0, 5), `- [y](${BLOB}/docs/y.md)`].join('\n'),
    );
  });

  test('rewrites reference definitions and leaves the references and unused brackets alone', () => {
    const input = [
      'See [the guide][guide], [install] and [v0.9.0].',
      '',
      '[guide]: docs/upgrade.md#upgrade "Upgrade"',
      '[install]: <docs/install guide.md>',
      '[ext]: https://example.test/docs/a.md',
      '[top]: #changelog',
    ].join('\n');
    expect(rewrite(input)).toBe(
      [
        'See [the guide][guide], [install] and [v0.9.0].',
        '',
        `[guide]: ${BLOB}/docs/upgrade.md#upgrade "Upgrade"`,
        `[install]: <${BLOB}/docs/install%20guide.md>`,
        '[ext]: https://example.test/docs/a.md',
        '[top]: #changelog',
      ].join('\n'),
    );
  });

  test('does not treat a definition inside a code block as one', () => {
    const input = '```\n[guide]: docs/upgrade.md\n```';
    expect(rewrite(input)).toBe(input);
  });

  test('leaves escaped brackets, a version heading and text that is not a link alone', () => {
    const input = [
      '## [v0.9.0] - 2026-10-20',
      '',
      'Escaped \\[x\\](docs/x.md), a [bare label] (docs/y.md) and [unclosed(docs/z.md).',
    ].join('\n');
    expect(rewrite(input)).toBe(input);
  });

  test('does not read past a paragraph for the end of a label', () => {
    const input = '[open\n\nclose](docs/x.md)';
    expect(rewrite(input)).toBe(input);
  });

  test.each([
    '[',
    '![',
    ']',
    '[a](',
    '[a](<',
    '[a](docs/a.md "x',
    '\\',
    '`',
    '``a`',
    '[a]((',
    '',
    '\n',
  ])('returns malformed markdown %j unchanged', (input) => {
    expect(rewrite(input)).toBe(input);
  });

  test('uses the forge host and tag it is given', () => {
    expect(
      absoluteRepositoryLinks('[a](docs/a.md)', {
        origin: 'https://git.example',
        repository: 'team/quro',
        tag: 'v1.0.0-rc.1',
      }),
    ).toBe('[a](https://git.example/team/quro/blob/v1.0.0-rc.1/docs/a.md)');
  });

  test('is idempotent', () => {
    const once = rewrite('[a](docs/a.md#x) ![b](docs/b.png)');
    expect(rewrite(once)).toBe(once);
  });

  test('leaves no relative link in a real CHANGELOG section', () => {
    const changelog = readFileSync(`${import.meta.dir}/../../CHANGELOG.md`, 'utf8');
    const section = changelogSection(changelog, 'v0.8.0');
    if (!section) throw new Error('CHANGELOG.md has no v0.8.0 section');
    const rewritten = rewrite(section);
    const destinations = [...rewritten.matchAll(/\]\(([^)\s]+)/g)].map((match) => match[1]);
    expect(destinations.length).toBeGreaterThan(20);
    for (const destination of destinations) {
      expect(destination).toMatch(/^(https:\/\/|#)/);
    }
    expect(rewritten).toContain(`](${BLOB}/docs/upgrade.md#how-upgrades-work)`);
    // Only link destinations change.
    expect(rewritten.replaceAll(`${BLOB}/`, '')).toBe(section);
  });
});
