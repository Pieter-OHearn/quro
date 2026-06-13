import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '../../../..');
const schemaSource = readFileSync(join(import.meta.dir, 'schema.ts'), 'utf8');

const FRONTEND_NORMALIZERS = [
  'packages/frontend/src/features/savings/utils/normalizers.ts',
  'packages/frontend/src/features/investments/utils/normalizers.ts',
  'packages/frontend/src/features/goals/hooks/goal-normalizer.ts',
  'packages/frontend/src/features/debts/utils/debt-normalizers.ts',
  'packages/frontend/src/features/mortgage/utils/mortgage-normalizers.ts',
  'packages/frontend/src/features/pension/utils/pension-api-normalizers.ts',
  'packages/frontend/src/features/salary/utils/normalizers.ts',
  'packages/frontend/src/features/budget/utils/normalizers.ts',
];

describe('numeric wire contract', () => {
  test('maps Drizzle numeric columns to JavaScript numbers at the schema boundary', () => {
    expect(schemaSource).toContain('const numericAsNumber = customType');
    expect(schemaSource).toContain('fromDriver(value)');
    expect(schemaSource).toContain('return Number.isFinite(parsed) ? parsed : 0;');
    expect(schemaSource).not.toMatch(/\bnumeric\s*,/);
    expect(schemaSource.match(/numericAsNumber\(/g)).toHaveLength(54);
  });

  test('does not reintroduce frontend numeric API response coercion helpers', () => {
    for (const relativePath of FRONTEND_NORMALIZERS) {
      const source = readFileSync(join(REPO_ROOT, relativePath), 'utf8');

      expect(source).not.toContain('toNumber');
      expect(source).not.toContain('parseFloat');
      expect(source).not.toContain('Number.parseFloat');
    }
  });

  test('uses the shared Goal type directly instead of an ApiGoal numeric shim', () => {
    const goalsTypes = readFileSync(
      join(REPO_ROOT, 'packages/frontend/src/features/goals/types.ts'),
      'utf8',
    );

    expect(goalsTypes).not.toContain('ApiGoal');
  });
});
