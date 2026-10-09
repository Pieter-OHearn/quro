import { describe, expect, test } from 'bun:test';
import { DrizzleQueryError } from 'drizzle-orm';
import { describeSyncFailure } from './syncFailure';

describe('describeSyncFailure', () => {
  test('keeps the text of a failure from the bank or from a check of ours', () => {
    expect(describeSyncFailure(new Error('Insufficient authentication.'), 'Sync failed')).toBe(
      'Insufficient authentication.',
    );
  });

  test('replaces a failed statement, which repeats the SQL and its values', () => {
    const failed = new DrizzleQueryError(
      'insert into "savings_transactions" ("amount", "note") values ($1, $2)',
      ['4200.00', 'Salary March'],
      Object.assign(new Error('duplicate key'), { severity: 'ERROR', code: '23505' }),
    );
    const text = describeSyncFailure(failed, 'Sync failed');

    expect(text).toBe('Sync failed');
    expect(text).not.toContain('savings_transactions');
    expect(text).not.toContain('Salary March');
  });

  test('replaces a driver error that arrives without the statement wrapper', () => {
    const driver = Object.assign(new Error('relation "x" does not exist'), {
      severity: 'ERROR',
      code: '42P01',
    });
    expect(describeSyncFailure(driver, 'Sync failed')).toBe('Sync failed');
    expect(describeSyncFailure(new Error('wrapper', { cause: driver }), 'Sync failed')).toBe(
      'Sync failed',
    );
  });

  test('uses the fallback for anything that is not an error', () => {
    expect(describeSyncFailure('text', 'Sync failed')).toBe('Sync failed');
    expect(describeSyncFailure(null, 'Sync failed')).toBe('Sync failed');
  });
});
