/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Debt } from '@quro/shared';
import {
  buildDebtOverview,
  calculateDebtMonthsRemaining,
  estimateDebtRemainingInterest,
  formatDebtPayoffLabel,
} from './debt-metrics';

const CAR_LOAN: Debt = {
  id: 1,
  name: 'Car Loan',
  type: 'car_loan',
  lender: 'Lender',
  originalAmount: 22_000,
  remainingBalance: 14_800,
  currency: 'EUR',
  interestRate: 4.9,
  monthlyPayment: 420,
  startDate: '2023-03-01',
  endDate: '2027-03-01',
  color: '#6366f1',
  emoji: '🚗',
  notes: null,
};

test('calculates debt payoff timing from amortization inputs', () => {
  const monthsRemaining = calculateDebtMonthsRemaining(
    CAR_LOAN.remainingBalance,
    CAR_LOAN.interestRate,
    CAR_LOAN.monthlyPayment,
  );

  expect(monthsRemaining).toBeGreaterThan(0);
  expect(formatDebtPayoffLabel(CAR_LOAN, new Date('2026-03-11T00:00:00Z'))).toMatch(
    /^[A-Z][a-z]{2} \d{4}$/,
  );
});

test('returns n/a when the payment cannot amortize the debt', () => {
  expect(
    formatDebtPayoffLabel(
      {
        ...CAR_LOAN,
        monthlyPayment: 0,
      },
      new Date('2026-03-11T00:00:00Z'),
    ),
  ).toBe('n/a');
  expect(
    estimateDebtRemainingInterest({
      ...CAR_LOAN,
      monthlyPayment: 10,
    }),
  ).toBeNull();
});

test('builds a debt overview in the selected base currency', () => {
  const overview = buildDebtOverview(
    [
      CAR_LOAN,
      {
        ...CAR_LOAN,
        id: 2,
        name: 'Student Loan',
        type: 'student_loan',
        remainingBalance: 21_400,
        monthlyPayment: 180,
        interestRate: 0.46,
        color: '#0ea5e9',
        emoji: '🎓',
      },
    ],
    (amount, currency) => (currency === 'EUR' ? amount : amount * 0.9),
  );

  expect(overview.debtCount).toBe(2);
  expect(overview.totalBalance).toBe(36_200);
  expect(overview.totalMonthlyPayment).toBe(600);
  expect(overview.averageInterestRate).toBeGreaterThan(0.46);
  expect(overview.highestInterestRate).toBe(4.9);
});
