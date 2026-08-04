import { describe, expect, test } from 'bun:test';
import {
  buildActivityList,
  buildNetWorthHistory,
  computeDerivedAllocations,
  getActivityCutoff,
} from './dashboard';

describe('dashboard debt integration helpers', () => {
  test('bounds activity queries from the start of the previous UTC month', () => {
    expect(getActivityCutoff(new Date('2026-08-04T12:00:00Z'))).toBe('2026-07-01');
    expect(getActivityCutoff(new Date('2026-01-15T12:00:00Z'))).toBe('2025-12-01');
  });

  test('includes liabilities metadata alongside asset allocations', () => {
    const summary = computeDerivedAllocations(
      new Map([['EUR', 1]]),
      [{ id: 1, balance: '1500', currency: 'EUR' }] as any,
      [] as any,
      [] as any,
      [] as any,
      [] as any,
      [] as any,
      [{ id: 1, remainingBalance: '250', currency: 'EUR' }] as any,
    );

    expect(summary.allocations.find((item) => item.name === 'Savings')?.value).toBe(1500);
    expect(summary.liabilitiesTotal).toBe(250);
    expect(summary.debtCount).toBe(1);
  });

  test('does not silently convert missing FX rates as 1:1', () => {
    expect(() =>
      computeDerivedAllocations(
        new Map([['EUR', 1]]),
        [{ id: 1, balance: '1500', currency: 'GBP' }] as any,
        [] as any,
        [] as any,
        [] as any,
        [] as any,
        [] as any,
        [] as any,
      ),
    ).toThrow('Missing FX rate for GBP -> EUR');
  });

  test('values property equity from active mortgages, treating archived links as unencumbered', () => {
    const summary = computeDerivedAllocations(
      new Map([['EUR', 1]]),
      [] as any,
      [] as any,
      [] as any,
      [
        // Linked to an active mortgage → its balance is subtracted.
        {
          id: 1,
          currentValue: '400000',
          purchasePrice: '350000',
          mortgage: '0',
          mortgageId: 10,
          currency: 'EUR',
        },
        // Linked to an archived mortgage (absent from the active set) →
        // treated as unencumbered rather than using the stale snapshot.
        {
          id: 2,
          currentValue: '300000',
          purchasePrice: '280000',
          mortgage: '120000',
          mortgageId: 99,
          currency: 'EUR',
        },
        // No linked mortgage → falls back to its own manual balance.
        {
          id: 3,
          currentValue: '250000',
          purchasePrice: '250000',
          mortgage: '80000',
          mortgageId: null,
          currency: 'EUR',
        },
      ] as any,
      [] as any,
      [{ id: 10, outstandingBalance: '250000' }] as any,
      [] as any,
    );

    const propertyEquity = summary.allocations.find(
      (item) => item.name === 'Property Equity',
    )?.value;
    expect(propertyEquity).toBe(150000 + 300000 + 170000);
  });

  test('subtracts non-mortgage debts from historical and current net worth', () => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const history = buildNetWorthHistory({
      rates: new Map([['EUR', 1]]),
      savings: [{ id: 1, balance: '1500', currency: 'EUR' }] as any,
      savingsTransactions: [] as any,
      holdings: [] as any,
      holdingTransactions: [] as any,
      properties: [] as any,
      propertyTransactions: [] as any,
      pensions: [] as any,
      pensionTransactions: [] as any,
      mortgages: [] as any,
      debts: [{ id: 1, remainingBalance: '800', currency: 'EUR' }] as any,
      debtPayments: [
        {
          debtId: 1,
          amount: '250',
          principal: '200',
          interest: '50',
          date: todayIso,
          note: 'Monthly payment',
        },
      ] as any,
    } as any);

    const currentPoint = history.at(-1);
    const previousPoint = history.at(-2);

    expect(currentPoint?.totalValue).toBe(700);
    expect(previousPoint?.totalValue).toBe(500);
  });

  test('maps debt payments into dashboard activity as debt expenses', () => {
    const activity = buildActivityList(
      [],
      [],
      [],
      [],
      [],
      [
        {
          debtId: 42,
          date: '2026-03-05',
          amount: '200',
          principal: '160',
          interest: '40',
          note: 'Card payment',
        },
      ] as any,
      [],
      [],
      new Map(),
      new Map(),
      new Map(),
      new Map([[42, 'EUR']]),
      new Map(),
      new Map(),
    );

    expect(activity[0]).toMatchObject({
      name: 'Card payment',
      type: 'expense',
      amount: -200,
      category: 'Debt',
      currency: 'EUR',
    });
  });
});
