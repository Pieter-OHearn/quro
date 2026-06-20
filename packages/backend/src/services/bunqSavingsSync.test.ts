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
  test('classifies bunq PAYDAY credits as savings interest', () => {
    expect(
      classifySavingsPayment(
        payment({
          amount: { value: '4.20', currency: 'EUR' },
          description: 'bunq Payday 2026-06-09 EUR',
          type: 'PAYDAY',
        }),
      ),
    ).toBe('interest');
  });

  test('uses the bunq payment type instead of loose description matching', () => {
    expect(
      classifySavingsPayment(
        payment({
          description: 'bunq Payday 2026-06-09 EUR',
          type: 'BUNQ',
        }),
      ),
    ).toBe('deposit');
    expect(classifySavingsPayment(payment({ subType: 'SAVINGS_INTEREST' }))).toBe('deposit');
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
