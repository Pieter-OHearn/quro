/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { CurrencyCode, Payslip } from '@quro/shared';
import { computeSalaryMetrics } from './salary-data';

const convertToEur = (amount: number, fromCurrency: CurrencyCode) => {
  if (fromCurrency === 'GBP') return amount * 1.18;
  return amount;
};

const createPayslip = (overrides: Partial<Payslip> = {}): Payslip => ({
  id: 1,
  month: '2024-01',
  date: '2024-01-31',
  gross: 0,
  tax: 0,
  pension: 0,
  net: 0,
  bonus: null,
  currency: 'EUR',
  document: null,
  ...overrides,
});

test('aggregates mixed-currency salary history entries by year before charting', () => {
  const metrics = computeSalaryMetrics(
    [],
    [],
    [
      {
        year: 2024,
        annualSalary: 42_000,
        currency: 'EUR',
      },
      {
        year: 2024,
        annualSalary: 5_000,
        currency: 'GBP',
      },
      {
        year: 2025,
        annualSalary: 72_000,
        currency: 'EUR',
      },
    ],
    convertToEur,
    2026,
  );

  expect(metrics.salaryChartData).toEqual([
    { year: '2024', gross: 47_900, net: 47_900 },
    { year: '2025', gross: 72_000, net: 72_000 },
  ]);
});

test('uses payslip net/gross for years that have payslips, falls back to history gross for years without', () => {
  const metrics = computeSalaryMetrics(
    [],
    [
      createPayslip({ date: '2026-03-31', gross: 5_000, net: 3_800, tax: 900, pension: 300 }),
      createPayslip({ date: '2026-04-30', gross: 5_000, net: 3_800, tax: 900, pension: 300 }),
    ],
    [
      { year: 2024, annualSalary: 42_000, currency: 'EUR' },
      { year: 2025, annualSalary: 60_000, currency: 'EUR' },
      { year: 2026, annualSalary: 72_000, currency: 'EUR' },
    ],
    convertToEur,
    2026,
  );

  expect(metrics.salaryChartData).toEqual([
    { year: '2024', gross: 42_000, net: 42_000 },
    { year: '2025', gross: 60_000, net: 60_000 },
    { year: '2026', gross: 10_000, net: 7_600 },
  ]);
});
