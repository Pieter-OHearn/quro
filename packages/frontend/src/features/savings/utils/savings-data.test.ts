/// <reference types="bun-types" />

import { afterEach, expect, setSystemTime, test } from 'bun:test';
import type { SavingsAccount } from '@quro/shared';
import { buildGrowthChartData, computeSavingsMetrics } from './savings-data';

const accountBase: SavingsAccount = {
  id: 1,
  name: 'Closed Reserve',
  bank: 'Monzo',
  balance: 1000,
  currency: 'EUR',
  interestRate: 1.2,
  accountType: 'Easy Access',
  color: '#2563eb',
  emoji: 'R',
};

afterEach(() => {
  setSystemTime();
});

test('keeps archived savings accounts in past history but removes them after archive', () => {
  setSystemTime(new Date('2026-05-04T12:00:00Z'));

  const data = buildGrowthChartData(
    [
      {
        id: 1,
        accountId: 1,
        type: 'deposit',
        amount: 250,
        date: '2025-12-15',
        note: 'Top up',
      },
    ],
    [
      {
        ...accountBase,
        archivedAt: '2026-01-15T00:00:00.000Z',
      },
    ],
    (value) => value,
  );

  expect(data.find((point) => point.month === 'Nov')?.savings).toBe(750);
  expect(data.find((point) => point.month === 'Dec')?.savings).toBe(1000);
  expect(data.find((point) => point.month === 'Jan')?.savings).toBe(0);
});

test('includes transactions from the final local day of each month', () => {
  setSystemTime(new Date('2026-06-15T12:00:00Z'));

  const data = buildGrowthChartData(
    [
      {
        id: 1,
        accountId: 1,
        type: 'deposit',
        amount: 100,
        date: '2026-05-31',
        note: 'Month-end top up',
      },
    ],
    [accountBase],
    (value) => value,
  );

  expect(data.find((point) => point.month === 'May')?.savings).toBe(1000);
});

test('counts a joint account at the household share, like the dashboard', () => {
  const metrics = computeSavingsMetrics(
    [
      { ...accountBase, id: 1, balance: 10_000.01, isJoint: false, interestRate: 2 },
      { ...accountBase, id: 2, balance: 6_000.01, isJoint: true, interestRate: 3 },
    ],
    (value) => value,
  );
  // 10,000.01 + 3,000.005 (rounded once to 3,000.01).
  expect(metrics.totalInBase).toBe(13_000.02);
  expect(metrics.avgRate).toBeCloseTo((2 * 10_000.01 + 3 * 3_000.005) / 13_000.015, 10);
});
