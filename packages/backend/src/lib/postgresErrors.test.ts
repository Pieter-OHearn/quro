import { describe, expect, it } from 'bun:test';
import {
  hasPostgresErrorCode,
  isDataException,
  isForeignKeyViolation,
  isUniqueViolation,
} from './postgresErrors';

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

describe('violation helpers', () => {
  it('matches unique and foreign-key violations by code', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isForeignKeyViolation({ cause: { code: '23503' } })).toBe(true);
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
  });
});

describe('isDataException', () => {
  it('matches the data exception class, wrapped or not', () => {
    expect(isDataException({ code: '22003' })).toBe(true);
    expect(isDataException({ cause: { cause: { code: '22021' } } })).toBe(true);
    expect(isDataException({ code: '22P02' })).toBe(true);
  });

  it('ignores other classes, other kinds of code and cyclic causes', () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;

    expect(isDataException({ code: '23505' })).toBe(false);
    expect(isDataException({ code: 'ECONNREFUSED' })).toBe(false);
    expect(isDataException({ code: 22003 })).toBe(false);
    expect(isDataException(cyclic)).toBe(false);
    expect(isDataException('22003')).toBe(false);
  });
});
