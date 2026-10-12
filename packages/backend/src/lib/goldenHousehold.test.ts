import { describe, expect, test } from 'bun:test';
import {
  GOLDEN_DEBTS,
  GOLDEN_HOLDINGS,
  GOLDEN_HOLDING_TRANSACTIONS,
  GOLDEN_MORTGAGES,
  GOLDEN_PENSIONS,
  GOLDEN_PROPERTIES,
  GOLDEN_RATES_TO_EUR,
  GOLDEN_SAVINGS,
  GOLDEN_TOTALS,
} from '@quro/shared/test/fixtures/goldenHousehold';
import { computeDerivedAllocations } from './netWorth';
import { scopeHouseholdRows } from './partner';

// The dashboard's totals for the shared golden household. The frontend's page totals assert the
// same figures (packages/frontend/src/features/goldenHousehold.test.ts), so the two agree.
describe('golden household: dashboard allocations', () => {
  test('match the golden totals to the cent', () => {
    const summary = computeDerivedAllocations(
      new Map(Object.entries(GOLDEN_RATES_TO_EUR)),
      scopeHouseholdRows('savings', GOLDEN_SAVINGS, (row) => row.isJoint),
      GOLDEN_HOLDINGS,
      GOLDEN_HOLDING_TRANSACTIONS,
      scopeHouseholdRows('properties', GOLDEN_PROPERTIES, (row) => row.isJoint),
      GOLDEN_PENSIONS,
      scopeHouseholdRows('mortgages', GOLDEN_MORTGAGES, (row) => row.isJoint),
      GOLDEN_DEBTS,
    );
    const value = (key: string) => summary.allocations.find((row) => row.key === key)!.value;
    expect({
      savings: value('savings'),
      brokerage: value('brokerage'),
      propertyEquity: value('property_equity'),
      pension: value('pension'),
      liabilities: summary.liabilitiesTotal,
      totalAssets: summary.totalAssets,
      netWorth: summary.netWorth,
    }).toEqual(GOLDEN_TOTALS);
    expect(summary.portfolioTotal).toBe(GOLDEN_TOTALS.brokerage);
  });
});
