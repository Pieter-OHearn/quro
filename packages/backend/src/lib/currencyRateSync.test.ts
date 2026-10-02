import { afterAll, describe, expect, mock, test } from 'bun:test';
import { CURRENCY_CODES } from '@quro/shared';
import { currencyRateHistory, currencyRates } from '../db/schema';

type CurrencyRateWrite = {
  table: unknown;
  values: unknown[];
  conflict: 'update' | 'nothing';
};

const writes: CurrencyRateWrite[] = [];
let reads = 0;
const rateRows = CURRENCY_CODES.filter((currency) => currency !== 'EUR').map(
  (fromCurrency, index) => ({
    id: index + 1,
    fromCurrency,
    toCurrency: 'EUR' as const,
    rate: 1,
    provider: 'test',
    sourceDate: '2026-01-01',
    updatedAt: new Date(),
  }),
);
const { db: realDb, queryClient } = await import('../db/client');

await mock.module('../db/client', () => ({
  queryClient,
  db: {
    select: () => ({
      from: () => ({
        orderBy: () => {
          reads++;
          return Promise.resolve(rateRows);
        },
      }),
    }),
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

const {
  getCurrencyRateSyncCurrencies,
  syncCurrencyRates,
  getCurrentCurrencyRateRows,
  invalidateCurrentCurrencyRateCache,
} = await import('./currencyRateSync');

afterAll(async () => {
  invalidateCurrentCurrencyRateCache();
  await mock.module('../db/client', () => ({ db: realDb, queryClient }));
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

test('concurrent current-rate reads share a DB load and reuse the cache', async () => {
  invalidateCurrentCurrencyRateCache();
  reads = 0;
  const results = await Promise.all(Array.from({ length: 10 }, () => getCurrentCurrencyRateRows()));
  expect(reads).toBe(1);
  expect(results.every((rows) => rows === rateRows)).toBe(true);
  await getCurrentCurrencyRateRows();
  expect(reads).toBe(1);
});

test('provider refreshes share a promise and invalidate cached current rates', async () => {
  let calls = 0;
  let finish: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const fetchRates = async () => {
    calls++;
    await gate;
    return { rates: [], issues: [] };
  };
  const first = syncCurrencyRates({ fetchRates });
  const second = syncCurrencyRates({ fetchRates });
  expect(second).toBe(first);
  expect(calls).toBe(1);
  finish();
  await first;
  const previousReads = reads;
  await getCurrentCurrencyRateRows();
  expect(reads).toBe(previousReads + 1);
});
