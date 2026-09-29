import { describe, expect, test } from 'bun:test';
import { computePensionTransactionDelta } from './pensionTransactions';

describe('computePensionTransactionDelta', () => {
  test('contributions add the amount net of tax', () => {
    expect(
      computePensionTransactionDelta({ type: 'contribution', amount: 100, taxAmount: 20 }),
    ).toBe(80);
  });

  test('fees subtract the amount', () => {
    expect(computePensionTransactionDelta({ type: 'fee', amount: 15, taxAmount: 0 })).toBe(-15);
  });

  test('annual statements apply the signed amount as-is', () => {
    expect(
      computePensionTransactionDelta({ type: 'annual_statement', amount: -40, taxAmount: 0 }),
    ).toBe(-40);
  });

  test('unknown types have no effect', () => {
    expect(computePensionTransactionDelta({ type: 'other', amount: 50, taxAmount: 5 })).toBe(0);
  });
});
