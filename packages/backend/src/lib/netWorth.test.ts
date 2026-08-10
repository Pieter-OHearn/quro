import { describe, expect, test } from 'bun:test';
import { earliestDate, monthEnd, monthStart, resolveHistoricalHoldingPrice } from './netWorth';

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
