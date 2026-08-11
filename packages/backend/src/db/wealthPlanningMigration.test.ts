import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('./migrations/0025_jazzy_bloodaxe.sql', import.meta.url),
  'utf8',
);
const employmentMigration = readFileSync(
  new URL('./migrations/0026_aberrant_beast.sql', import.meta.url),
  'utf8',
);

describe('wealth planning migration', () => {
  test('creates the planning and snapshot schema', () => {
    expect(migration).toContain('CREATE TABLE "employment_profiles"');
    expect(migration).toContain('CREATE TABLE "plan_assumptions"');
    expect(migration).toContain('CREATE TABLE "net_worth_snapshots"');
    expect(migration).toContain('ADD COLUMN "expense_class"');
    expect(migration).toContain('ADD COLUMN "jurisdiction"');
  });

  test('moves trustworthy profile fields into shared employment records', () => {
    expect(employmentMigration).toContain('CREATE TABLE "employments"');
    expect(employmentMigration).toContain('INSERT INTO "employments"');
    expect(employmentMigration).toContain('ADD COLUMN "employment_id"');
    expect(employmentMigration).not.toContain('"tenure_months" integer');
  });

  test('classifies existing preset categories conservatively', () => {
    expect(migration).toContain('SET "expense_class" = \'discretionary\'');
    for (const name of [
      'Restaurants & Bars',
      'Shopping',
      'Subscriptions',
      'Entertainment',
      'Travel',
      'Personal Care',
    ]) {
      expect(migration).toContain(`'${name}'`);
    }
    expect(migration).toContain('SET "expense_class" = \'essential\'');
    expect(migration).not.toContain('SET "expense_class" = \'employment_linked\'');
  });
});
