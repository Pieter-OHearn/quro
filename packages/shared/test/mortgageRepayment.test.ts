/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import {
  expectedMortgageRepayment,
  mortgageRateOnDate,
  suggestMortgageRepayment,
  type MortgageRepaymentTerms,
} from '../src/index.js';

const LINEAR: MortgageRepaymentTerms = {
  repaymentType: 'Linear',
  originalAmount: 705_000,
  termYears: 30,
  monthlyPayment: 4_220.21,
  interestRate: 3.85,
};
const ANNUITY: MortgageRepaymentTerms = {
  repaymentType: 'Annuity',
  originalAmount: 300_000,
  termYears: 30,
  monthlyPayment: 1_264.81,
  interestRate: 3,
};

describe('expected mortgage repayment', () => {
  test('linear: a fixed share of the original amount plus interest on the balance', () => {
    // The first payment: 705,000.00 / 360 = 1,958.33 and 705,000.00 × 3.85% / 12 = 2,261.88.
    expect(expectedMortgageRepayment(LINEAR, 705_000, 3.85)).toEqual({
      amount: 4_220.21,
      interest: 2_261.88,
      principal: 1_958.33,
    });
    // Interest falls with the balance, so the payment falls too.
    expect(expectedMortgageRepayment(LINEAR, 699_125, 3.85)).toEqual({
      amount: 4_201.36,
      interest: 2_243.03,
      principal: 1_958.33,
    });
  });

  test('annuity: the monthly payment, split into interest and the rest', () => {
    expect(expectedMortgageRepayment(ANNUITY, 300_000, 3)).toEqual({
      amount: 1_264.81,
      interest: 750,
      principal: 514.81,
    });
    // Interest above the payment repays nothing.
    expect(expectedMortgageRepayment(ANNUITY, 300_000, 6)).toEqual({
      amount: 1_500,
      interest: 1_500,
      principal: 0,
    });
  });

  test('never repays more than the balance', () => {
    expect(expectedMortgageRepayment(LINEAR, 1_000, 3.85)).toEqual({
      amount: 1_003.21,
      interest: 3.21,
      principal: 1_000,
    });
    expect(expectedMortgageRepayment(ANNUITY, 0, 3)).toEqual({
      amount: 0,
      interest: 0,
      principal: 0,
    });
    expect(expectedMortgageRepayment({ ...LINEAR, termYears: 0 }, 1_000, 0).principal).toBe(0);
  });
});

describe('mortgage rate on a date', () => {
  const changes = [
    { date: '2025-06-01', amount: 4.1 },
    { date: '2026-03-01', amount: 3.6 },
  ];

  test('is the latest rate change on or before the date, else the current rate', () => {
    expect(mortgageRateOnDate(3.85, changes, '2026-03-01')).toBe(3.6);
    expect(mortgageRateOnDate(3.85, changes, '2026-02-28')).toBe(4.1);
    // Before the first recorded change the earlier rate is unknown, so the current rate is used.
    expect(mortgageRateOnDate(3.85, changes, '2025-01-01')).toBe(3.85);
    expect(mortgageRateOnDate(3.85, [], '2026-03-01')).toBe(3.85);
    expect(mortgageRateOnDate(3.85, [...changes].reverse(), '2026-04-01')).toBe(3.6);
  });

  test('a suggestion uses the rate in effect on its date', () => {
    expect(suggestMortgageRepayment(LINEAR, 705_000, '2026-04-01', changes)).toEqual({
      amount: 4_073.33,
      interest: 2_115,
      principal: 1_958.33,
      rate: 3.6,
    });
  });
});
