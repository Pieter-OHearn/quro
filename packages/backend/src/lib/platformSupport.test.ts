import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isAtLeast,
  MINIMUM_BUN_VERSION,
  postgresMajorProblem,
  runtimeProblems,
  SUPPORTED_POSTGRES_MAJORS,
} from './platformSupport';

const ROOT = join(import.meta.dir, '../../../..');

describe('supported hosts and runtimes', () => {
  test('accepts the release platforms and the pinned Bun', () => {
    const bun = readFileSync(join(ROOT, '.bun-version'), 'utf8').trim();
    expect(runtimeProblems({ platform: 'linux', arch: 'x64', bunVersion: bun })).toEqual([]);
    expect(runtimeProblems({ platform: 'linux', arch: 'arm64', bunVersion: bun })).toEqual([]);
    expect(isAtLeast(bun, MINIMUM_BUN_VERSION)).toBe(true);
  });

  test('names what is unsupported', () => {
    const problems = runtimeProblems({ platform: 'win32', arch: 'ia32', bunVersion: '1.1.0' });
    expect(problems).toHaveLength(3);
    expect(problems.join(' ')).toContain('win32');
    expect(problems.join(' ')).toContain('ia32');
    expect(problems.join(' ')).toContain('Bun 1.1.0');
  });

  test('compares versions numerically', () => {
    expect(isAtLeast('1.10.0', '1.4.0')).toBe(true);
    expect(isAtLeast('1.4.0', '1.4.0')).toBe(true);
    expect(isAtLeast('1.3.99', '1.4.0')).toBe(false);
    expect(isAtLeast('2.0.0-canary.1', '1.4.0')).toBe(true);
  });

  test('supports PostgreSQL from the oldest major to the image client tools major', () => {
    const dockerfile = readFileSync(join(ROOT, 'packages/backend/Dockerfile'), 'utf8');
    const toolsMajor = Number(/^ARG POSTGRES_CLIENT_MAJOR=(\d+)$/m.exec(dockerfile)?.[1]);
    expect(SUPPORTED_POSTGRES_MAJORS.newest as number).toBe(toolsMajor);
    expect(postgresMajorProblem(16)).toBeNull();
    expect(postgresMajorProblem(18)).toBeNull();
    expect(postgresMajorProblem(15)).toContain('not supported');
    expect(postgresMajorProblem(19)).toContain('not supported');
  });
});
