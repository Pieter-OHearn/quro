import { describe, expect, test } from 'bun:test';
import {
  applyDebtPrincipalPayment,
  computeDebtPrincipal,
  parseDebtPayload,
  parseDebtPaymentPayload,
  restoreDebtPrincipalPayment,
  validateDebtPrincipalAgainstBalance,
} from './debts';

describe('debt payload validation', () => {
  test('accepts a valid debt payload', () => {
    const parsed = parseDebtPayload({
      name: 'Volkswagen Golf Loan',
      type: 'car_loan',
      lender: 'Volkskrediet Bank',
      originalAmount: 22_000,
      remainingBalance: 14_800,
      currency: 'EUR',
      interestRate: 4.9,
      monthlyPayment: 420,
      startDate: '2023-03-01',
      endDate: '2027-03-01',
      color: '#6366f1',
      emoji: '🚗',
      notes: 'No early repayment penalty',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.remainingBalance).toBe(14_800);
    expect(parsed.data.notes).toBe('No early repayment penalty');
  });

  test('rejects incoherent debt balances and dates', () => {
    const balanceError = parseDebtPayload({
      name: 'Broken Loan',
      type: 'personal_loan',
      lender: 'Bank',
      originalAmount: 1000,
      remainingBalance: 1200,
      currency: 'EUR',
      interestRate: 5,
      monthlyPayment: 100,
      startDate: '2024-01-01',
      color: '#ef4444',
      emoji: '💼',
    });
    const dateError = parseDebtPayload({
      name: 'Broken Loan',
      type: 'personal_loan',
      lender: 'Bank',
      originalAmount: 1000,
      remainingBalance: 800,
      currency: 'EUR',
      interestRate: 5,
      monthlyPayment: 100,
      startDate: '2024-02-01',
      endDate: '2024-01-01',
      color: '#ef4444',
      emoji: '💼',
    });

    expect(balanceError).toEqual({
      ok: false,
      error: 'Remaining balance cannot exceed the original amount',
    });
    expect(dateError).toEqual({
      ok: false,
      error: 'End date cannot be earlier than the start date',
    });
  });
});

describe('debt payment validation and balance helpers', () => {
  test('derives principal from total payment and interest', () => {
    const parsed = parseDebtPaymentPayload({
      debtId: 1,
      date: '2026-03-05',
      amount: 420,
      interest: 60,
      note: 'Monthly payment',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.principal).toBe(360);
    expect(computeDebtPrincipal(420, 60)).toBe(360);
  });

  test('rejects invalid interest allocations and overpaying principal', () => {
    expect(
      parseDebtPaymentPayload({
        debtId: 1,
        date: '2026-03-05',
        amount: 120,
        interest: 150,
      }),
    ).toEqual({
      ok: false,
      error: 'Interest cannot exceed total payment',
    });

    expect(validateDebtPrincipalAgainstBalance(200, 150)).toBe(
      'Principal portion cannot exceed the current remaining balance',
    );
  });

  test('applies and restores remaining balances transactionally', () => {
    const afterPayment = applyDebtPrincipalPayment(1000, 125.5);
    const afterDelete = restoreDebtPrincipalPayment(afterPayment, 125.5);

    expect(afterPayment).toBe(874.5);
    expect(afterDelete).toBe(1000);
  });
});
