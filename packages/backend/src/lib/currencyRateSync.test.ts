import { afterAll, describe, expect, mock, test } from 'bun:test';
import { currencyRateHistory, currencyRates } from '../db/schema';

type CurrencyRateWrite = {
  table: unknown;
  values: unknown[];
  conflict: 'update' | 'nothing';
};

const writes: CurrencyRateWrite[] = [];
const { db: realDb } = await import('../db/client');

await mock.module('../db/client', () => ({
  db: {
    transaction: (callback: (tx: unknown) => Promise<void>) =>
      callback({
        insert: (table: unknown) => ({
          values: (values: unknown[]) => ({
            onConflictDoUpdate: () => {
              writes.push({ table, values, conflict: 'update' });
              return Promise.resolve();
            },
            onConflictDoNothing: () => {
              writes.push({ table, values, conflict: 'nothing' });
              return Promise.resolve();
            },
          }),
        }),
      }),
  },
}));

const { getCurrencyRateSyncCurrencies, syncCurrencyRates } = await import('./currencyRateSync');

afterAll(async () => {
  await mock.module('../db/client', () => ({ db: realDb }));
  mock.restore();
});

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

  test('persists the latest cache and dated history in one transaction', async () => {
    writes.length = 0;

    await syncCurrencyRates({
      syncedAt: new Date('2026-05-08T12:00:00.000Z'),
      fetchRates: (baseCurrency, fromCurrencies) =>
        Promise.resolve({
          rates: fromCurrencies.map((fromCurrency) => ({
            fromCurrency,
            toCurrency: baseCurrency,
            rate: 1,
            provider: 'test',
            sourceDate: '2026-05-08',
          })),
          issues: [],
        }),
    });

    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ table: currencyRates, conflict: 'update' });
    expect(writes[1]).toMatchObject({ table: currencyRateHistory, conflict: 'nothing' });
    expect(writes[0]?.values).toHaveLength(7);
    expect(writes[1]?.values).toEqual(writes[0]?.values);
  });
});
