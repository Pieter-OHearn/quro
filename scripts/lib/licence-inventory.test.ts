import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { collectJavaScript, findProblems, isAllowed, licenceOf, render } from './licence-inventory';

describe('isAllowed', () => {
  test.each([
    'MIT',
    'Apache-2.0',
    '(MIT OR CC0-1.0)',
    'MIT AND ISC',
    '(AFL-2.1 OR BSD-3-Clause)',
    'Apache-2.0 WITH LLVM-exception',
  ])('accepts %s', (expression) => {
    expect(isAllowed(expression)).toBe(true);
  });

  test.each([
    '',
    'GPL-3.0-only',
    'AGPL-3.0-or-later',
    'MIT AND GPL-2.0-only',
    'SEE LICENSE IN LICENSE',
    'UNLICENSED',
  ])('refuses %s', (expression) => {
    expect(isAllowed(expression)).toBe(false);
  });
});

describe('licenceOf', () => {
  test('reads the string, object and legacy array forms', () => {
    expect(licenceOf({ license: 'MIT' })).toBe('MIT');
    expect(licenceOf({ license: { type: 'ISC' } })).toBe('ISC');
    expect(licenceOf({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe(
      '(MIT OR Apache-2.0)',
    );
    expect(licenceOf({})).toBe('');
  });
});

describe('findProblems and render', () => {
  const packages = [
    { name: 'ok', version: '1.0.0', licence: 'MIT', usedBy: new Set(['backend']) },
    { name: 'copyleft', version: '2.0.0', licence: 'GPL-3.0-only', usedBy: new Set(['frontend']) },
    { name: 'unknown', version: '3.0.0', licence: '', usedBy: new Set(['backend', 'frontend']) },
  ];

  test('flags licences outside the policy and missing licences', () => {
    expect(findProblems(packages)).toEqual([
      'copyleft@2.0.0: licence GPL-3.0-only is not in the allowed list',
      'unknown@3.0.0: no licence declared',
    ]);
  });

  test('renders a summary and a row per package', () => {
    const markdown = render(packages, findProblems(packages));
    expect(markdown).toContain('3 shipped third-party packages');
    expect(markdown).toContain('| (none) | 1 |');
    expect(markdown).toContain('| unknown | 3.0.0 | (none) | backend, frontend |');
    expect(markdown).toContain('## Problems');
  });
});

describe('collectJavaScript', () => {
  const { packages, missing } = collectJavaScript(join(import.meta.dir, '..', '..'));
  const names = new Set([...packages.values()].map((entry) => entry.name));

  test('follows the production dependencies of the shipped workspaces', () => {
    expect(missing).toEqual([]);
    for (const name of ['hono', 'drizzle-orm', 'react', 'react-dom'])
      expect(names.has(name)).toBe(true);
    expect(
      [...packages.values()].find((entry) => entry.name === 'hono')?.usedBy.has('backend'),
    ).toBe(true);
  });

  test('leaves out development tooling and Quro’s own workspaces', () => {
    for (const name of [
      'eslint',
      'typescript',
      'vite',
      'drizzle-kit',
      '@playwright/test',
      '@quro/shared',
    ]) {
      expect(names.has(name)).toBe(false);
    }
  });

  test('every shipped package has an allowed licence', () => {
    expect(findProblems([...packages.values()])).toEqual([]);
  });
});
