import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA_PATH = join(import.meta.dir, 'schema.ts');

const USER_OWNED_TABLES = [
  'savings_accounts',
  'savings_transactions',
  'holdings',
  'holding_transactions',
  'properties',
  'property_transactions',
  'pension_pots',
  'pension_transactions',
  'mortgages',
  'mortgage_transactions',
  'payslips',
  'goals',
  'budget_categories',
  'budget_transactions',
  'dashboard_transactions',
];

function getTableDefinition(schema: string, tableName: string) {
  const marker = `pgTable(\n  '${tableName}'`;
  const start = schema.indexOf(marker);
  expect(start, `${tableName} table definition should exist`).toBeGreaterThanOrEqual(0);

  const nextTable = schema.indexOf('export const ', start + marker.length);
  return schema.slice(start, nextTable === -1 ? undefined : nextTable);
}

describe('user-owned financial table schema', () => {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');

  test.each(USER_OWNED_TABLES)('%s requires an owner', (tableName) => {
    const tableDefinition = getTableDefinition(schema, tableName);

    expect(tableDefinition).toContain("userId: integer('user_id')");
    expect(tableDefinition).toMatch(
      /userId: integer\('user_id'\)[\s\S]*?\.references\(\(\) => users\.id\)[\s\S]*?\.notNull\(\)/,
    );
  });
});
