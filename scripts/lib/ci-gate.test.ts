import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { findFailedNeeds } from './ci-gate';

const run = (needs: unknown) =>
  Bun.spawnSync(['bun', `${import.meta.dir}/ci-gate.ts`], {
    env: { ...process.env, NEEDS_JSON: JSON.stringify(needs) },
  });

describe('findFailedNeeds', () => {
  test('passes when every job succeeded', () => {
    expect(findFailedNeeds({ lint: { result: 'success' }, build: { result: 'success' } })).toEqual(
      [],
    );
  });

  test.each(['failure', 'cancelled', 'skipped'])('flags a %s job', (result) => {
    expect(findFailedNeeds({ lint: { result }, build: { result: 'success' } })).toEqual([
      `lint: ${result}`,
    ]);
  });

  test('fails closed when nothing is reported', () => {
    expect(findFailedNeeds({})).toHaveLength(1);
  });
});

describe('ci-gate CLI', () => {
  test('exits 0 when all succeed', () => {
    expect(run({ lint: { result: 'success' } }).exitCode).toBe(0);
  });

  test('exits 1 when a job fails', () => {
    const result = run({ lint: { result: 'failure' }, build: { result: 'skipped' } });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('lint: failure');
  });

  test('exits 1 on invalid input', () => {
    const result = Bun.spawnSync(['bun', `${import.meta.dir}/ci-gate.ts`], {
      env: { ...process.env, NEEDS_JSON: '' },
    });
    expect(result.exitCode).toBe(1);
  });
});

describe('ci.yml aggregate job', () => {
  const workflow = Bun.YAML.parse(
    readFileSync(`${import.meta.dir}/../../.github/workflows/ci.yml`, 'utf8'),
  ) as { jobs: Record<string, { if?: string; needs?: string[] }> };

  test('runs even when upstream jobs fail', () => {
    expect(workflow.jobs.ci.if).toBe('always()');
  });

  test('needs every other job', () => {
    const others = Object.keys(workflow.jobs).filter((name) => name !== 'ci');
    expect([...(workflow.jobs.ci.needs ?? [])].sort()).toEqual(others.sort());
  });
});
