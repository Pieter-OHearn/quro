import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const ROUTES = [
  ['savings.ts', 3],
  ['investments.ts', 6],
  ['mortgages.ts', 3],
  ['debts.ts', 2],
  ['pensions.ts', 3],
  ['pension-imports.ts', 1],
  ['salary.ts', 3],
] as const;

describe('net worth snapshot invalidation wiring', () => {
  for (const [fileName, expectedCalls] of ROUTES) {
    test(`${fileName} invalidates every dated mutation path`, () => {
      const source = readFileSync(new URL(`../routes/${fileName}`, import.meta.url), 'utf8');
      expect(source.match(/invalidateSnapshotsFrom\(/g)?.length ?? 0).toBe(expectedCalls);
      expect(source).toContain('db.transaction');
    });
  }

  test('updates invalidate from the earlier of the old and new date', () => {
    for (const fileName of [
      'savings.ts',
      'investments.ts',
      'mortgages.ts',
      'pensions.ts',
      'salary.ts',
    ]) {
      const source = readFileSync(new URL(`../routes/${fileName}`, import.meta.url), 'utf8');
      expect(source).toContain('earliestDate(');
    }
  });
});
