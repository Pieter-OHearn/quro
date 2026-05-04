/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Mortgage } from '@quro/shared';
import { generateSchedule } from './mortgage-metrics';

const mortgageBase: Mortgage = {
  id: 1,
  linkedPropertyId: 1,
  propertyAddress: '1 Canal Street',
  lender: 'Quro Bank',
  currency: 'EUR',
  originalAmount: 2400,
  outstandingBalance: 2400,
  propertyValue: 300000,
  monthlyPayment: 100,
  interestRate: 0,
  rateType: 'Fixed',
  fixedUntil: '2034-04',
  termYears: 2,
  startDate: '2032-04-01',
  endDate: '2034-03-31',
  overpaymentLimit: 10,
};

test('derives mortgage projection years from the current mortgage schedule', () => {
  const schedule = generateSchedule(mortgageBase, 24, new Date('2032-04-15T12:00:00Z'));

  expect(schedule.map((row) => row.year)).toEqual(['2032', '2034']);
  expect(schedule.at(-1)?.balance).toBe(0);
});

test('accumulates non-zero interest across schedule periods', () => {
  const mortgage: Mortgage = {
    ...mortgageBase,
    outstandingBalance: 1200,
    monthlyPayment: 110,
    interestRate: 12,
    termYears: 1,
    startDate: '2030-01-01',
    endDate: '2030-12-31',
  };
  const schedule = generateSchedule(mortgage, 12, new Date('2030-01-15T12:00:00Z'));

  expect(schedule.at(-1)?.balance).toBe(0);
  expect(schedule.at(-1)?.interest).toBeGreaterThan(0);
  expect(schedule.at(-1)?.principal).toBeGreaterThan(0);
  // total repaid = original balance
  const totalPrincipal = schedule.slice(1).reduce((sum, row) => sum + row.principal, 0);
  expect(totalPrincipal).toBe(1200);
});
