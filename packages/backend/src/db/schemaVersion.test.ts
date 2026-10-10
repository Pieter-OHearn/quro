import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUNDLED_MIGRATIONS,
  compareSchema,
  describeSchema,
  latestBundledMigration,
} from './schemaVersion';

const bundled = [
  { tag: '0000_first', when: 100 },
  { tag: '0001_second', when: 200 },
  { tag: '0002_third', when: 300 },
];

describe('schema comparison', () => {
  test('follows the journal the migrator applies', () => {
    const journal = JSON.parse(
      readFileSync(join(import.meta.dir, 'migrations/meta/_journal.json'), 'utf8'),
    ) as { entries: { tag: string; when: number }[] };
    expect(BUNDLED_MIGRATIONS.map((entry) => entry.tag)).toEqual(journal.entries.map((e) => e.tag));
    expect(latestBundledMigration().tag).toBe(journal.entries.at(-1)!.tag);
    // The migrator applies everything newer than the newest applied entry, so order matters.
    const whens = BUNDLED_MIGRATIONS.map((entry) => entry.when);
    expect([...whens].sort((a, b) => a - b)).toEqual(whens);
  });

  test('classifies empty, behind, current, ahead and unknown schemas', () => {
    expect(compareSchema(null, bundled)).toMatchObject({ status: 'empty', pending: bundled });
    expect(compareSchema(200, bundled)).toMatchObject({
      status: 'behind',
      applied: bundled[1],
      pending: [bundled[2]],
    });
    expect(compareSchema(300, bundled)).toEqual({ status: 'current', latest: bundled[2]! });
    expect(compareSchema(301, bundled)).toEqual({ status: 'ahead' });
    expect(compareSchema(250, bundled)).toEqual({ status: 'unknown' });
  });

  test('describes each state with the action to take', () => {
    expect(describeSchema(compareSchema(100, bundled))).toContain('2 migration(s) behind');
    expect(describeSchema(compareSchema(100, bundled))).toContain('quro migrate');
    expect(describeSchema(compareSchema(301, bundled))).toContain('newer than this image');
    expect(describeSchema(compareSchema(250, bundled))).toContain('does not ship');
  });
});
