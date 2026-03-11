/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type {
  CurrencyCode,
  DashboardAllocationsSummary,
  DashboardTransaction as DashboardTransactionPayload,
  NetWorthSnapshot,
  Payslip,
} from '@quro/shared';
import { convertCurrencyAmount, createCurrencyRateTable } from '@/lib/currencyRates';
import {
  computeDashboardTxnStats,
  normalizeAssetAllocations,
  normalizeDashboardTransactions,
  normalizeNetWorthSnapshots,
} from './dashboard-data';

const SERVER_RATE_ROWS = [
  {
    id: 1,
    fromCurrency: 'EUR',
    toCurrency: 'EUR',
    rate: 1,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 2,
    fromCurrency: 'GBP',
    toCurrency: 'EUR',
    rate: 1.18,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 3,
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    rate: 0.922,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
] as const;

const rateTable = createCurrencyRateTable(SERVER_RATE_ROWS);

function createConvertToBase(baseCurrency: CurrencyCode) {
  return (amount: number, currency: string) => {
    const converted = convertCurrencyAmount(
      amount,
      currency as CurrencyCode,
      baseCurrency,
      rateTable,
    );

    if (converted === null) {
      throw new Error(`Missing FX rate for ${currency} -> ${baseCurrency}`);
    }

    return converted;
  };
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

test('normalizes dashboard payload rows using each row currency metadata', () => {
  const convertToGbp = createConvertToBase('GBP');
  const snapshots: NetWorthSnapshot[] = [
    { id: 1, month: 'Mar', year: 2026, totalValue: 1000, currency: 'EUR' },
  ];
  const allocations: DashboardAllocationsSummary = {
    allocations: [{ id: 1, name: 'Savings', value: 1000, color: '#6366f1', currency: 'EUR' }],
    liabilitiesTotal: 250,
    debtCount: 2,
  };
  const transactions: DashboardTransactionPayload[] = [
    {
      id: 1,
      name: 'UK dividend',
      type: 'income',
      amount: 100,
      date: '2026-03-05',
      category: 'Investment',
      currency: 'GBP',
    },
    {
      id: 2,
      name: 'US rent',
      type: 'income',
      amount: 200,
      date: '2026-03-06',
      category: 'Property',
      currency: 'USD',
    },
  ];

  const chartData = normalizeNetWorthSnapshots(snapshots, convertToGbp);
  const allocationSummary = normalizeAssetAllocations(allocations, convertToGbp);
  const activityData = normalizeDashboardTransactions(transactions, convertToGbp);

  expect(chartData[0]?.value).toBeCloseTo(1000 / 1.18, 10);
  expect(allocationSummary.allocationData[0]?.value).toBeCloseTo(1000 / 1.18, 10);
  expect(allocationSummary.liabilitiesTotal).toBeCloseTo(250 / 1.18, 10);
  expect(allocationSummary.debtCount).toBe(2);
  expect(allocationSummary.netWorth).toBeCloseTo((1000 - 250) / 1.18, 10);
  expect(activityData[0]?.amount).toBe(100);
  expect(activityData[1]?.amount).toBeCloseTo((200 * 0.922) / 1.18, 10);
});

test('computes dashboard stats from normalized mixed-currency activity and payslips', () => {
  const convertToEur = createConvertToBase('EUR');
  const currentMonthKey = toMonthKey(new Date());
  const transactions = normalizeDashboardTransactions(
    [
      {
        id: 1,
        name: 'US consulting',
        type: 'income',
        amount: 100,
        date: `${currentMonthKey}-05`,
        category: 'Salary',
        currency: 'USD',
      },
      {
        id: 2,
        name: 'UK groceries',
        type: 'expense',
        amount: -25,
        date: `${currentMonthKey}-07`,
        category: 'Budget',
        currency: 'GBP',
      },
      {
        id: 3,
        name: 'US savings deposit',
        type: 'transfer',
        amount: -50,
        date: `${currentMonthKey}-09`,
        category: 'Savings',
        currency: 'USD',
      },
    ] satisfies DashboardTransactionPayload[],
    convertToEur,
  );
  const payslips: Payslip[] = [
    {
      id: 1,
      month: currentMonthKey,
      date: `${currentMonthKey}-28`,
      gross: 3000,
      tax: 500,
      pension: 200,
      net: 2300,
      bonus: 200,
      currency: 'GBP',
      document: null,
    },
  ];

  const stats = computeDashboardTxnStats(transactions, payslips, convertToEur);

  expect(stats.totalIncome).toBeCloseTo(92.2, 10);
  expect(stats.totalExpenses).toBeCloseTo(29.5, 10);
  expect(stats.monthlyCategoryChange('Savings')).toBeCloseTo(46.1, 10);
  expect(stats.monthlySalaryValue).toBeCloseTo((2300 + 200) * 1.18, 10);
  expect(stats.salaryTrendChange).toBe(0);
});
