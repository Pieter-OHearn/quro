/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { CurrencyCode, Payslip } from '@quro/shared';
import { buildBreakdownLines, computeSalaryMetrics, findPreviousPayslip } from './salary-data';

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

test('lines read deductions as negative amounts and the change as a gain or a loss', () => {
  const previous = createPayslip({ id: 1, gross: 5_000, tax: 1_200, pension: 250, net: 3_550 });
  const selected = createPayslip({ id: 2, gross: 5_500, tax: 1_400, pension: 275, net: 3_825 });

  const lines = buildBreakdownLines(selected, previous, (amount) => amount);

  expect(lines.map((line) => line.key)).toEqual(['gross', 'tax', 'pension', 'net']);
  expect(lines.find((line) => line.key === 'tax')).toMatchObject({
    value: -1_400,
    compareValue: -1_200,
    change: -200,
  });
  expect(lines.find((line) => line.key === 'net')?.change).toBe(275);
  expect(lines.find((line) => line.key === 'net')?.pct).toBeCloseTo(69.5, 0);
});

test('lines add a bonus row when either payslip has one and name corrections', () => {
  const selected = createPayslip({ id: 2, gross: 5_000, tax: -100, pension: -20, net: 5_120 });
  const bonusMonth = createPayslip({ id: 1, gross: 5_000, bonus: 800, tax: 0, pension: 0, net: 0 });

  const lines = buildBreakdownLines(selected, bonusMonth, (amount) => amount);

  expect(lines.map((line) => line.label)).toEqual([
    'Gross pay',
    'Bonus',
    'Tax correction',
    'Pension correction',
    'Take-home pay',
  ]);
  expect(lines[1]).toMatchObject({ value: 0, compareValue: 800, change: -800 });
  expect(lines[2].value).toBe(100);
});

test('lines convert each payslip from its own currency and round the change to cents', () => {
  const sterling = createPayslip({ id: 1, currency: 'GBP', gross: 3_333.33, net: 3_333.33 });
  const euro = createPayslip({ id: 2, gross: 4_000, net: 4_000 });

  const lines = buildBreakdownLines(euro, sterling, convertToEur);

  expect(lines[0].compareValue).toBeCloseTo(3_933.33, 2);
  expect(lines[0].change).toBe(66.67);
});

test('lines without a comparison carry no change', () => {
  const lines = buildBreakdownLines(createPayslip({ gross: 100, net: 100 }), null, (a) => a);
  expect(lines.every((line) => line.compareValue === null && line.change === null)).toBe(true);
});

test('finds the payslip dated before the selected one across years', () => {
  const payslips = [
    createPayslip({ id: 1, date: '2025-12-25' }),
    createPayslip({ id: 2, date: '2026-01-25' }),
    createPayslip({ id: 3, date: '2026-01-25' }),
    createPayslip({ id: 4, date: '2026-02-25' }),
  ];

  expect(findPreviousPayslip(payslips[1], payslips)?.id).toBe(1);
  expect(findPreviousPayslip(payslips[2], payslips)?.id).toBe(2);
  expect(findPreviousPayslip(payslips[3], payslips)?.id).toBe(3);
  expect(findPreviousPayslip(payslips[0], payslips)).toBeNull();
});
