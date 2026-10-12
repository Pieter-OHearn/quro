import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { compile } from 'tailwindcss';

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

/** Compiles theme.css on top of Tailwind and returns the CSS generated for `candidates`. */
async function buildUtilities(candidates: string[]): Promise<string> {
  const compiler = await compile(`@import 'tailwindcss';\n${theme}`, {
    base: import.meta.dir,
    loadStylesheet: async (id, base) => {
      const path = Bun.resolveSync(id === 'tailwindcss' ? 'tailwindcss/index.css' : id, base);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
  return compiler.build(candidates);
}

test('motion tokens use the durations of docs/design-v1.md', () => {
  for (const name of ['motion-fast', 'motion-base']) {
    const spec = designSpec.match(new RegExp(`\`${name}\` (\\d+ms)`));
    expect(spec?.[1]).toBeDefined();
    expect(root.get(`--${name}`)).toBe(spec?.[1]);
  }
});

test('duration-fast, -base and -slow set the transition duration from the motion tokens', async () => {
  const css = await buildUtilities(['duration-fast', 'duration-base', 'duration-slow']);
  for (const name of ['fast', 'base', 'slow']) {
    const rule = css.match(new RegExp(`\\.duration-${name} \\{([^}]*)\\}`))?.[1] ?? '';
    // `--tw-duration` is what `transition-colors` and the other transition utilities read.
    expect(rule).toContain(`--tw-duration: var(--motion-${name});`);
    expect(rule).toContain(`transition-duration: var(--motion-${name});`);
  }
});
