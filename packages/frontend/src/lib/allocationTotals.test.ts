import { expect, test } from 'bun:test';
import type { DashboardAllocationsSummary } from '@quro/shared';
import { allocationTotals } from './allocationTotals';
import { normalizeAssetAllocations } from '@/features/dashboard/utils/dashboard-data';

test('uses server totals and explicit currencies even without allocation rows', () => {
  const summary: DashboardAllocationsSummary = {
    allocations: [],
    currency: 'EUR',
    liabilitiesCurrency: 'USD',
    netWorth: -920,
    totalAssets: 0,
    portfolioTotal: 120,
    liabilitiesTotal: 1000,
    debtCount: 1,
  };
  const convert = (amount: number, currency: string) =>
    (amount * (currency === 'USD' ? 0.92 : 1)) / 1.18;
  expect(allocationTotals(summary, convert)).toEqual({
    netWorth: -920 / 1.18,
    portfolioTotal: 120 / 1.18,
  });
  const display = normalizeAssetAllocations(summary, convert);
  expect(display.liabilitiesTotal).toBeCloseTo(920 / 1.18, 10);
  expect(display.netWorth).toBeCloseTo(-920 / 1.18, 10);
});

test('allocation appearance uses stable keys instead of translated display names', () => {
  const summary: DashboardAllocationsSummary = {
    allocations: [{ id: 2, key: 'brokerage', name: 'Beleggingen', value: 100, currency: 'EUR' }],
    currency: 'EUR',
    liabilitiesCurrency: 'EUR',
    netWorth: 75,
    totalAssets: 100,
    portfolioTotal: 100,
    liabilitiesTotal: 25,
    debtCount: 1,
  };
  const display = normalizeAssetAllocations(summary, (amount) => amount);
  expect(display.allocationData[0]).toMatchObject({
    key: 'brokerage',
    name: 'Beleggingen',
    color: '#0ea5e9',
  });
  expect(allocationTotals(summary, (amount) => amount)).toEqual({
    portfolioTotal: 100,
    netWorth: 75,
  });
});
