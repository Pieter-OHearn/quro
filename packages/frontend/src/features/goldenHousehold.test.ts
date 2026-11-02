/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { sumMoney } from '@quro/shared';
import {
  GOLDEN_DEBTS,
  GOLDEN_HOLDINGS,
  GOLDEN_HOLDING_TRANSACTIONS,
  GOLDEN_PENSIONS,
  GOLDEN_POSITIONS,
  GOLDEN_PROPERTIES,
  GOLDEN_SAVINGS,
  GOLDEN_TOTALS,
  toGoldenEur,
} from '@quro/shared/test/fixtures/goldenHousehold';
import { buildDebtOverview } from './debts/utils/debt-metrics';
import { computeHoldingRowMetrics } from './investments/components/BrokerageTab';
import { computeInvestmentPortfolioStats } from './investments/hooks/useInvestmentPortfolioStats';
import { computePositions, isInvestmentProperty } from './investments/utils/position';
import { computePensionTotals } from './pension/utils/pension-calculations';
import { computeSavingsMetrics } from './savings/utils/savings-data';

// The totals the savings, investments, pension and debts pages show for the shared golden
// household, in an EUR display currency. The backend's dashboard allocations assert the same
// figures (packages/backend/src/lib/goldenHousehold.test.ts), so a page and the dashboard agree.
describe('golden household: page totals', () => {
  const positions = computePositions(GOLDEN_HOLDINGS, [...GOLDEN_HOLDING_TRANSACTIONS]);
  const portfolio = computeInvestmentPortfolioStats(
    GOLDEN_HOLDINGS,
    positions,
    GOLDEN_PROPERTIES,
    [],
    toGoldenEur,
  );
  const pages = {
    savings: computeSavingsMetrics([...GOLDEN_SAVINGS], toGoldenEur).totalInBase,
    brokerage: portfolio.totalBrokerageBase,
    propertyEquity: portfolio.totalPropertyEquityBase,
    pension: computePensionTotals([...GOLDEN_PENSIONS], [], toGoldenEur).totalInBase,
    liabilities: buildDebtOverview(GOLDEN_DEBTS, toGoldenEur).totalBalance,
  };

  test('match the dashboard’s golden totals to the cent', () => {
    const totalAssets = sumMoney([
      pages.savings,
      pages.brokerage,
      pages.propertyEquity,
      pages.pension,
    ]);
    expect({
      ...pages,
      totalAssets,
      netWorth: sumMoney([totalAssets, -pages.liabilities]),
    }).toEqual(GOLDEN_TOTALS);
  });

  test('positions follow the shared rule', () => {
    for (const [holdingId, expected] of Object.entries(GOLDEN_POSITIONS)) {
      expect(positions[Number(holdingId)]).toMatchObject(expected);
    }
  });

  test('with a manual price the brokerage rows still add up to the brokerage total', () => {
    // Holding 1 at a manual USD 61.5: 12 × 61.5 = 738.00 USD → 678.96 EUR, not 553.36.
    const holdings = GOLDEN_HOLDINGS.map((holding) =>
      holding.id === 1 ? { ...holding, manualPrice: 61.5 } : holding,
    );
    const stats = computeInvestmentPortfolioStats(holdings, positions, [], [], toGoldenEur);
    const rows = holdings.map((holding) =>
      computeHoldingRowMetrics(
        holding,
        GOLDEN_HOLDING_TRANSACTIONS,
        positions[holding.id],
        toGoldenEur,
        (currency) => currency !== 'EUR',
      ),
    );
    expect(stats.totalBrokerageBase).toBe(sumMoney(rows.map((row) => row.valueInBase)));
    expect(stats.totalBrokerageBase).toBe(sumMoney([GOLDEN_TOTALS.brokerage, 678.96, -553.36]));
  });

  test('rent and expense rows are offered for the property types the API accepts', () => {
    expect(
      GOLDEN_PROPERTIES.map((property) => isInvestmentProperty(property.propertyType)),
    ).toEqual([false, true, true]);
  });
});
