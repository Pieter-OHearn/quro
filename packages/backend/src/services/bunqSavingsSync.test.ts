import { describe, expect, test } from 'bun:test';
import { classifySavingsPayment, type SavingsPaymentClassificationInput } from './bunqSavingsSync';

function payment(
  overrides: Partial<SavingsPaymentClassificationInput>,
): SavingsPaymentClassificationInput {
  return {
    amount: { value: '1.23', currency: 'EUR' },
    description: 'Regular deposit',
    type: 'BUNQ',
    subType: 'PAYMENT',
    ...overrides,
  };
}

describe('Bunq savings payment classification', () => {
  test('classifies bunq Payday credits as savings interest', () => {
    expect(
      classifySavingsPayment(
        payment({
          amount: { value: '4.20', currency: 'EUR' },
          description: 'bunq Payday 2026-06-09 EUR',
        }),
      ),
    ).toBe('interest');
  });

  test('classifies interest metadata as savings interest', () => {
    expect(classifySavingsPayment(payment({ subType: 'SAVINGS_INTEREST' }))).toBe('interest');
    expect(classifySavingsPayment(payment({ description: 'Monthly interest payout' }))).toBe(
      'interest',
    );
  });

  test('keeps ordinary savings money movements as deposits or withdrawals', () => {
    expect(classifySavingsPayment(payment({ amount: { value: '25.00', currency: 'EUR' } }))).toBe(
      'deposit',
    );
    expect(classifySavingsPayment(payment({ amount: { value: '-10.00', currency: 'EUR' } }))).toBe(
      'withdrawal',
    );
  });
});
