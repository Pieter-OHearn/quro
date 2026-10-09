import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const designSpec = readFileSync(new URL('../../../../docs/design-v1.md', import.meta.url), 'utf8');

function declarations(selector: string): Map<string, string> {
  const blocks = [...theme.matchAll(new RegExp(`^${selector} \\{\\n([\\s\\S]*?)^\\}`, 'gm'))];
  expect(blocks).toHaveLength(1);
  return new Map(
    [...blocks[0]![1]!.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

/** Variable → Dark value from the colour token table of docs/design-v1.md. */
function specDarkValues(): Map<string, string> {
  const rows = designSpec.matchAll(/^\| `(--[\w-]+)(?: \(new\))?`\s*\|[^|]*\|\s*`([^`]+)`\s*\|/gm);
  return new Map([...rows].map((m) => [m[1]!, m[2]!]));
}

const root = declarations(':root');
const dark = declarations('\\.dark');

test('the dark block comes after the only :root block, so it wins at equal specificity', () => {
  expect(theme.indexOf('\n.dark {')).toBeGreaterThan(theme.indexOf('\n:root {'));
});

test('every literal colour on :root has a dark value, and dark adds no new variable', () => {
  const literalColours = [...root]
    .filter(([, value]) => value.startsWith('#'))
    .map(([name]) => name);
  expect(literalColours.length).toBeGreaterThan(0);
  for (const name of literalColours) expect(dark.has(name)).toBe(true);
  for (const name of dark.keys()) expect(root.has(name)).toBe(true);
});

test('dark values match the Dark column of docs/design-v1.md and aliases are not repeated', () => {
  const spec = specDarkValues();
  expect(spec.size).toBeGreaterThan(0);
  for (const [name, value] of spec) {
    if (value.startsWith('var(')) {
      expect(root.get(name)).toBe(value);
      expect(dark.has(name)).toBe(false);
    } else {
      expect(dark.get(name)?.toLowerCase()).toBe(value.toLowerCase());
    }
  }
});

test('popover and overlay shadows use the dark values of docs/design-v1.md', () => {
  for (const name of ['shadow-popover', 'shadow-overlay']) {
    const spec = designSpec.match(new RegExp(`\`${name}\`: \`[^\`]+\`, dark \`([^\`]+)\``));
    expect(spec?.[1]).toBeDefined();
    expect(dark.get(`--${name}`)).toBe(spec?.[1]);
  }
});
