/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { SavingsAccount } from '@quro/shared';
import { buildGrowthChartData } from './savings-data';

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

test('keeps archived savings accounts in past history but removes them after archive', () => {
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
