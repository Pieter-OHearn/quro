import { describe, expect, test } from 'bun:test';
import { classifyDatabaseError, describeDatabaseError } from './connectionErrors';

const withCode = (code: string, message = 'driver message') =>
  Object.assign(new Error(message), { code });

describe('database error classification', () => {
  test('maps network failures and server start-up to unreachable', () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'CONNECT_TIMEOUT', '57P03', '08006']) {
      expect(classifyDatabaseError(withCode(code))).toBe('unreachable');
    }
  });

  test('maps rejected credentials and a missing database to rejected', () => {
    for (const code of ['28P01', '28000', '3D000']) {
      expect(classifyDatabaseError(withCode(code))).toBe('rejected');
    }
    expect(classifyDatabaseError(withCode('42P01'))).toBe('other');
  });

  test('never repeats a driver message that could hold a connection string', () => {
    const leaky = withCode('ECONNREFUSED', 'connect postgres://user:secret@db:5432/quro');
    expect(describeDatabaseError(leaky)).not.toContain('secret');
    expect(describeDatabaseError(new Error('postgres://user:secret@db/quro'))).not.toContain(
      'secret',
    );
  });
});
