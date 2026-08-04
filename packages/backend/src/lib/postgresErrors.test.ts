import { describe, expect, it } from 'bun:test';
import { hasPostgresErrorCode } from './postgresErrors';

describe('hasPostgresErrorCode', () => {
  it('finds direct and wrapped PostgreSQL error codes', () => {
    expect(hasPostgresErrorCode({ code: '23505' }, '23505')).toBe(true);
    expect(hasPostgresErrorCode({ cause: { code: '23503' } }, '23503')).toBe(true);
  });

  it('rejects other codes and handles cyclic causes', () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;

    expect(hasPostgresErrorCode({ cause: { code: '23503' } }, '23505')).toBe(false);
    expect(hasPostgresErrorCode(cyclic, '23505')).toBe(false);
  });
});
