import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { FIXTURE_DOCUMENTS, buildPdf, sha256Hex } from './documents';
import {
  compareTotals,
  planComparison,
  readManifest,
  summaryQuery,
  type Column,
  type Schema,
} from './verify';

const cols = (...names: string[]): Column[] =>
  names.map((name) => ({ name, numeric: name === 'amount' }));
const schema = (entries: Record<string, Column[]>): Schema => new Map(Object.entries(entries));

describe('planComparison', () => {
  test('compares unchanged tables column for column', () => {
    const tables = { 'public.t': cols('id', 'amount') };
    const { plan, problems } = planComparison(schema(tables), schema(tables), {});
    expect(problems).toEqual([]);
    expect(plan.tables).toEqual([
      {
        table: 'public.t',
        columns: cols('id', 'amount'),
        beforeSelect: ['"id"', '"amount"'],
        change: {},
      },
    ]);
  });

  test('uses the declared expressions for added and rewritten columns', () => {
    const { plan, problems } = planComparison(
      schema({ 'public.s': cols('id', 'created_at') }),
      schema({ 'public.s': cols('id', 'created_at', 'last_used_at') }),
      {
        'public.s': {
          rewrittenColumns: { id: 'md5(id)' },
          addedColumns: { last_used_at: 'created_at' },
        },
      },
    );
    expect(problems).toEqual([]);
    expect(plan.tables[0]?.beforeSelect).toEqual([
      'md5(id) as "id"',
      '"created_at"',
      'created_at as "last_used_at"',
    ]);
  });

  test('fails on undeclared tables and columns, and on dropped ones', () => {
    const { problems } = planComparison(
      schema({ 'public.kept': cols('id', 'gone'), 'public.dropped': cols('id') }),
      schema({ 'public.kept': cols('id', 'surprise'), 'public.added': cols('id') }),
      {},
    );
    expect(problems).toEqual([
      'public.dropped existed in 0.7.0 and is gone',
      'public.added was added by a migration and is not declared in expectations.ts',
      'public.kept.gone existed in 0.7.0 and is gone',
      'public.kept.surprise was added by a migration and is not declared in expectations.ts',
    ]);
  });

  test('fails on declarations that do not match the schema', () => {
    const { plan, problems } = planComparison(
      schema({ 'public.t': cols('id', 'x') }),
      schema({ 'public.t': cols('id', 'x'), 'public.n': cols('id') }),
      {
        'public.t': { newTable: { rows: 0 }, addedColumns: { x: 'null' } },
        'public.n': { newTable: { rows: 0 } },
        'public.stale': { newTable: { rows: 0 } },
      },
    );
    expect(plan.newTables).toEqual([{ table: 'public.n', rows: 0 }]);
    expect(problems).toEqual([
      'public.t is declared as new but existed in 0.7.0',
      'expectations.ts names public.stale, which does not exist after the upgrade',
      'public.t.x is declared as added but existed in 0.7.0',
    ]);
  });
});

describe('queries', () => {
  test('quote identifiers and keep the row filter', () => {
    const query = summaryQuery('public.we"ird', ['"a"'], cols('a'), 'id <= 3');
    expect(query).toContain('from "public"."we""ird" where id <= 3) r');
    expect(query).toContain(`count(*) filter (where r."a" is null)`);
  });
});

describe('compareTotals', () => {
  test('names the column and currency of a changed or missing total', () => {
    const failures: string[] = [];
    compareTotals(
      'public.t',
      cols('id', 'amount'),
      [
        { grp: 'EUR', sums: '10.00' },
        { grp: 'GBP', sums: '1.00' },
      ],
      [{ grp: 'EUR', sums: '10.01' }],
      failures,
    );
    expect(failures).toEqual([
      'public.t.amount: total for EUR is 10.01, expected 10.00',
      'public.t.amount: total for GBP is missing, expected 1.00',
    ]);
  });
});

describe('committed fixture', () => {
  const fixture = join(import.meta.dir, 'v0.7.0');

  test('the stored documents are the ones documents.ts builds, as listed in documents.sha256', async () => {
    const manifest = await readManifest(fixture);
    const stored = FIXTURE_DOCUMENTS.filter((document) => document.stored);
    expect(manifest.size).toBe(stored.length);
    for (const document of stored) {
      const key = [...manifest.keys()].find((candidate) =>
        candidate.endsWith(`/${document.uuid}.pdf`),
      );
      expect(key).toBeDefined();
      const bytes = new Uint8Array(await Bun.file(join(fixture, 'documents', key!)).arrayBuffer());
      expect(sha256Hex(buildPdf(document.lines))).toBe(sha256Hex(bytes));
      expect(sha256Hex(bytes)).toBe(manifest.get(key!)!);
    }
  });

  test('the dump is complete and holds no role passwords', async () => {
    const dump = await Bun.file(join(fixture, 'database.sql')).text();
    expect(dump).toContain('-- Dumped from database version 16.11');
    expect(dump).toContain('-- PostgreSQL database dump complete');
    expect(dump).not.toMatch(/\bPASSWORD\b/i);
  });
});
