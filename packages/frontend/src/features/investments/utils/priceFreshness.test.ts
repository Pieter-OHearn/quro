import { describe, expect, test } from 'bun:test';
import { isPriceStale } from './priceFreshness';

const now = new Date('2026-10-16T12:00:00.000Z');

describe('isPriceStale', () => {
  test('flags a synced price older than seven days', () => {
    expect(isPriceStale({ priceUpdatedAt: '2026-10-08T11:00:00.000Z' }, now)).toBe(true);
    expect(isPriceStale({ priceUpdatedAt: '2026-10-09T12:00:00.000Z' }, now)).toBe(false);
  });

  test('does not flag a manual price, a holding with sync off or a missing date', () => {
    const old = '2026-01-01T00:00:00.000Z';
    expect(isPriceStale({ priceUpdatedAt: old, manualPrice: 10 }, now)).toBe(false);
    expect(isPriceStale({ priceUpdatedAt: old, excludeFromSync: true }, now)).toBe(false);
    expect(isPriceStale({ priceUpdatedAt: null }, now)).toBe(false);
    expect(isPriceStale({ priceUpdatedAt: 'not a date' }, now)).toBe(false);
  });
});
