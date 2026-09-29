import { describe, expect, test } from 'bun:test';
import {
  earliestDate,
  monthEnd,
  monthStart,
  resolveHistoricalHoldingPrice,
  sumBrokerageValue,
} from './netWorth';

describe('net worth history helpers', () => {
  test('resolves the last close at or before a cutoff', () => {
    const prices = [
      { eodDate: '2026-03-31', closePrice: 101 },
      { eodDate: '2026-01-31', closePrice: 90 },
      { eodDate: '2026-02-28', closePrice: 95 },
    ];
    expect(resolveHistoricalHoldingPrice(prices, '2026-02-15')).toBe(90);
    expect(resolveHistoricalHoldingPrice(prices, '2025-12-31')).toBeNull();
  });

  test('normalizes snapshot boundaries and update invalidation dates', () => {
    expect(monthStart('2026-08-19')).toBe('2026-08-01');
    expect(monthEnd(new Date('2026-02-12T00:00:00Z'))).toBe('2026-02-28');
    expect(earliestDate('2026-03-10', '2026-02-20')).toBe('2026-02-20');
  });
});

describe('sumBrokerageValue', () => {
  const convert = (amount: number, currency: string) =>
    currency === 'USD' ? amount * 0.5 : amount;

  test('values net shares at the current price and floors net-short holdings at zero', () => {
    const holdings = [
      { id: 1, currency: 'EUR', currentPrice: 10 },
      { id: 2, currency: 'USD', currentPrice: '20' },
      { id: 3, currency: 'EUR', currentPrice: 5 },
    ];
    const transactions = [
      { holdingId: 1, type: 'buy', shares: 10 },
      { holdingId: 1, type: 'sell', shares: 4 },
      { holdingId: 1, type: 'dividend', shares: 99 },
      { holdingId: 2, type: 'buy', shares: '3' },
      { holdingId: 3, type: 'sell', shares: 2 },
    ];
    // 6 × 10 EUR + 3 × 20 USD × 0.5 + max(0, -2) × 5 EUR
    expect(sumBrokerageValue(holdings, transactions, convert)).toBe(90);
  });

  test('is zero with no holdings', () => {
    expect(sumBrokerageValue([], [], convert)).toBe(0);
  });
});
