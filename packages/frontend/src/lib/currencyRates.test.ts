/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { convertCurrencyAmount, createCurrencyRateTable } from './currencyRates';

const SERVER_RATE_ROWS = [
  {
    id: 1,
    fromCurrency: 'EUR',
    toCurrency: 'EUR',
    rate: 1,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 2,
    fromCurrency: 'GBP',
    toCurrency: 'EUR',
    rate: 1.18,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 3,
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    rate: 0.922,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 4,
    fromCurrency: 'AUD',
    toCurrency: 'EUR',
    rate: 0.6,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 5,
    fromCurrency: 'NZD',
    toCurrency: 'EUR',
    rate: 0.551,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 6,
    fromCurrency: 'CAD',
    toCurrency: 'EUR',
    rate: 0.66,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 7,
    fromCurrency: 'CHF',
    toCurrency: 'EUR',
    rate: 1.046,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 8,
    fromCurrency: 'SGD',
    toCurrency: 'EUR',
    rate: 0.68,
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
] as const;

const freshNow = new Date('2026-03-10T12:00:00.000Z');

test('converts between currencies using the synced EUR quotes', () => {
  const table = createCurrencyRateTable(SERVER_RATE_ROWS, freshNow);

  expect(convertCurrencyAmount(100, 'USD', 'GBP', table)).toBeCloseTo((100 * 0.922) / 1.18, 10);
  expect(convertCurrencyAmount(100, 'GBP', 'USD', table)).toBeCloseTo((100 * 1.18) / 0.922, 10);
});

test('passes through same-currency values without applying FX', () => {
  const table = createCurrencyRateTable(SERVER_RATE_ROWS, freshNow);

  expect(convertCurrencyAmount(2450, 'EUR', 'EUR', table)).toBe(2450);
});

test('accepts numeric strings from API payloads', () => {
  const table = createCurrencyRateTable(SERVER_RATE_ROWS, freshNow);

  expect(convertCurrencyAmount('2450.50', 'EUR', 'EUR', table)).toBe(2450.5);
  expect(convertCurrencyAmount('100', 'USD', 'GBP', table)).toBeCloseTo((100 * 0.922) / 1.18, 10);
});

test('tracks the latest update time and flags incomplete server coverage', () => {
  const table = createCurrencyRateTable(
    SERVER_RATE_ROWS.filter((row) => row.fromCurrency !== 'CHF').map((row, index) =>
      row.id === 8 ? { ...row, updatedAt: '2026-03-10T10:30:00.000Z', id: index + 1 } : row,
    ),
    freshNow,
  );

  expect(table.latestUpdatedAt).toBe('2026-03-10T10:30:00.000Z');
  expect(table.missingCurrencies).toEqual(['CHF']);
});

test('flags stale synced rates', () => {
  const table = createCurrencyRateTable(
    SERVER_RATE_ROWS.map((row) =>
      row.fromCurrency === 'GBP' ? { ...row, updatedAt: '2026-03-07T08:00:00.000Z' } : row,
    ),
    freshNow,
  );

  expect(table.staleCurrencies).toEqual(['GBP']);
});

test('rejects invalid server payload rows', () => {
  expect(() =>
    createCurrencyRateTable([
      {
        id: 1,
        fromCurrency: 'EUR',
        toCurrency: 'EUR',
        rate: 1,
        updatedAt: '2026-03-10T08:00:00.000Z',
      },
      {
        id: 2,
        fromCurrency: 'BTC',
        toCurrency: 'EUR',
        rate: 0.5,
        updatedAt: '2026-03-10T08:00:00.000Z',
      },
    ]),
  ).toThrow('Invalid currency code');
});
