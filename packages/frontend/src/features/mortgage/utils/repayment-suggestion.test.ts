/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Mortgage, MortgageTransaction } from '@quro/shared';
import {
  addOneMonth,
  nextRepaymentDate,
  repaymentNote,
  suggestRepayment,
} from './repayment-suggestion';

const repayment = (id: number, date: string): MortgageTransaction => ({
  id,
  mortgageId: 1,
  type: 'repayment',
  amount: 4220.21,
  interest: 2261.88,
  principal: 1958.33,
  date,
  note: '',
  fixedYears: null,
});

test('a month later keeps the day, or takes the last day of a shorter month', () => {
  expect(addOneMonth('2026-10-01')).toBe('2026-11-01');
  expect(addOneMonth('2026-12-15')).toBe('2027-01-15');
  expect(addOneMonth('2026-01-31')).toBe('2026-02-28');
  expect(addOneMonth('2028-01-31')).toBe('2028-02-29');
});

test('the next repayment follows the latest one, or is today without one', () => {
  const rows = [repayment(1, '2026-08-01'), repayment(2, '2026-10-01'), repayment(3, '2026-09-01')];
  expect(nextRepaymentDate(rows, '2026-10-29')).toBe('2026-11-01');
  expect(nextRepaymentDate([], '2026-10-29')).toBe('2026-10-29');
  expect(repaymentNote('2026-11-01')).toBe('November repayment');
});

test('suggests from the current balance at the rate in effect on the date', () => {
  const mortgage = {
    repaymentType: 'Linear',
    originalAmount: 705_000,
    termYears: 30,
    monthlyPayment: 4_220.21,
    interestRate: 3.85,
    outstandingBalance: 699_125,
  } as Mortgage;
  expect(suggestRepayment(mortgage, [repayment(1, '2026-10-01')], '2026-11-01')).toEqual({
    amount: 4201.36,
    interest: 2243.03,
    principal: 1958.33,
    rate: 3.85,
  });
  const rateChange = { ...repayment(2, '2026-12-01'), type: 'rate_change', amount: 3.6 } as const;
  expect(suggestRepayment(mortgage, [rateChange], '2027-01-01').rate).toBe(3.6);
  expect(suggestRepayment(mortgage, [rateChange], '2026-11-01').rate).toBe(3.85);
});
