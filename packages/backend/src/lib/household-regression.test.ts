import { expect, test } from 'bun:test';
import { computeDerivedAllocations } from './netWorth';
import { calculateBurn, calculateLiquidityTiers, simulateRunway } from './runway';

// Fixed before/after numbers from the pre-WP6 model. Inputs here are already
// attributed to one partner; integration tests cover loading and weighting.
test('preserves mixed-currency allocations and net worth, including negative equity', () => {
  const summary = computeDerivedAllocations(
    new Map([
      ['EUR', 1],
      ['USD', 0.8],
    ]),
    [
      { balance: 10000, currency: 'EUR' },
      { balance: 5000, currency: 'USD' },
    ],
    [{ id: 1, currentPrice: 100, currency: 'USD' }],
    [
      { holdingId: 1, type: 'buy', shares: 30 },
      { holdingId: 1, type: 'sell', shares: 5 },
    ],
    [
      { currentValue: 150000, mortgage: 999999, mortgageId: 1, currency: 'EUR' },
      { currentValue: 40000, mortgage: 50000, mortgageId: null, currency: 'USD' },
    ],
    [{ balance: 20000, currency: 'EUR' }],
    [{ id: 1, outstandingBalance: 100000 }],
    [{ remainingBalance: 3000, currency: 'USD' }],
  );
  expect(summary.allocations.map((item) => item.value)).toEqual([14000, 2000, 42000, 20000]);
  expect(summary.liabilitiesTotal).toBe(2400);
  expect(
    summary.allocations.reduce((sum, item) => sum + item.value, 0) - summary.liabilitiesTotal,
  ).toBe(75600);
});

test('preserves half-share contractual burn and the full-joint liquidity override', () => {
  const burn = calculateBurn({
    categories: [],
    contractual: [{ label: 'Home', amount: 1200, source: 'mortgage', isJoint: true }],
    derivedCashflowMonthly: 1000,
    assumptions: null,
  });
  expect(burn.lean).toBe(1000);
  expect(burn.components[0]?.amount).toBe(600);
  const assets = [{ amount: 20000, kind: 'easy_access' as const, isJoint: true }];
  const half = calculateLiquidityTiers(assets);
  const full = calculateLiquidityTiers(assets, { countFullJointBalances: true });
  expect(half[0]?.amount).toBe(10000);
  expect(full[0]?.amount).toBe(20000);
  expect(simulateRunway(burn.lean, half, null).monthsCashOnly).toBe(10);
  expect(simulateRunway(burn.lean, full, null).monthsCashOnly).toBe(20);
});
