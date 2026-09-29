import { describe, expect, test } from 'bun:test';
import { validatePensionTransactionPayload } from './pensionTransactionValidation';

const base = {
  potId: 1,
  type: 'contribution' as const,
  amount: '100',
  taxAmount: 10,
  date: '2026-01-31',
  note: 'January',
  isEmployer: true,
};

describe('validatePensionTransactionPayload', () => {
  test('normalizes a valid contribution', () => {
    expect(validatePensionTransactionPayload(base)).toEqual({
      ok: true,
      value: { ...base, amount: 100 },
    });
  });

  test('zeroes tax and employer source for fees and annual statements', () => {
    const fee = validatePensionTransactionPayload({ ...base, type: 'fee' });
    const statement = validatePensionTransactionPayload({ ...base, type: 'annual_statement' });
    expect(fee.ok && fee.value).toMatchObject({ taxAmount: 0, isEmployer: null });
    expect(statement.ok && statement.value).toMatchObject({ taxAmount: 0, isEmployer: null });
  });

  test('rejects invalid payloads', () => {
    expect(validatePensionTransactionPayload({ ...base, potId: '1.5' })).toEqual({
      ok: false,
      error: 'Invalid pension pot id',
    });
    expect(validatePensionTransactionPayload({ ...base, taxAmount: 200 })).toEqual({
      ok: false,
      error: 'Tax amount cannot exceed contribution amount',
    });
    expect(validatePensionTransactionPayload({ ...base, isEmployer: null })).toEqual({
      ok: false,
      error: 'Contribution requires employer/employee source',
    });
    expect(
      validatePensionTransactionPayload({ ...base, type: 'annual_statement', amount: 0 }),
    ).toEqual({
      ok: false,
      error: 'Annual statement amount cannot be zero',
    });
  });
});
