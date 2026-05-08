import { describe, expect, test } from 'bun:test';
import { getCurrencyRateSyncCurrencies, syncCurrencyRates } from './currencyRateSync';

describe('currency rate sync', () => {
  test('syncs every supported non-EUR currency against the base currency', () => {
    expect(getCurrencyRateSyncCurrencies()).toEqual([
      'GBP',
      'USD',
      'AUD',
      'NZD',
      'CAD',
      'CHF',
      'SGD',
    ]);
  });

  test('preserves the cache when the provider returns no usable rates', async () => {
    const summary = await syncCurrencyRates({
      syncedAt: new Date('2026-05-08T12:00:00.000Z'),
      fetchRates: (baseCurrency, fromCurrencies) =>
        Promise.resolve({
          rates: [],
          issues: fromCurrencies.map((fromCurrency) => ({
            fromCurrency,
            toCurrency: baseCurrency,
            reason: 'provider unavailable',
          })),
        }),
    });

    expect(summary).toMatchObject({
      requestedRates: 7,
      updatedRates: 0,
      skippedRates: 7,
      syncedAt: '2026-05-08T12:00:00.000Z',
    });
    expect(summary.issues).toHaveLength(7);
  });
});
