import { describe, expect, test } from 'bun:test';
import {
  buildRatesToBaseCurrency,
  convertToBaseCurrency,
  CurrencyRatesUnavailableError,
} from './currencyRateCache';

const freshUpdatedAt = new Date('2026-05-08T10:00:00.000Z');
const now = new Date('2026-05-08T12:00:00.000Z');

const completeRows = [
  { fromCurrency: 'GBP', toCurrency: 'EUR', rate: '1.18', updatedAt: freshUpdatedAt },
  { fromCurrency: 'USD', toCurrency: 'EUR', rate: '0.92', updatedAt: freshUpdatedAt },
  { fromCurrency: 'AUD', toCurrency: 'EUR', rate: '0.58', updatedAt: freshUpdatedAt },
  { fromCurrency: 'NZD', toCurrency: 'EUR', rate: '0.53', updatedAt: freshUpdatedAt },
  { fromCurrency: 'CAD', toCurrency: 'EUR', rate: '0.67', updatedAt: freshUpdatedAt },
  { fromCurrency: 'CHF', toCurrency: 'EUR', rate: '1.04', updatedAt: freshUpdatedAt },
  { fromCurrency: 'SGD', toCurrency: 'EUR', rate: '0.68', updatedAt: freshUpdatedAt },
] as const;

describe('currency rate cache', () => {
  test('builds a complete fresh rate map and converts strictly', () => {
    const rates = buildRatesToBaseCurrency(completeRows, now);

    expect(rates.get('EUR')).toBe(1);
    expect(convertToBaseCurrency(100, 'GBP', rates)).toBe(118);
  });

  test('rejects missing rates instead of falling back to 1:1', () => {
    expect(() => buildRatesToBaseCurrency(completeRows.slice(1), now)).toThrow(
      CurrencyRatesUnavailableError,
    );
    expect(() => convertToBaseCurrency(100, 'GBP', new Map([['EUR', 1]]))).toThrow(
      'Missing FX rate for GBP -> EUR',
    );
  });

  test('uses stale cached rates instead of blocking conversion', () => {
    const rates = buildRatesToBaseCurrency(
      completeRows.map((row) =>
        row.fromCurrency === 'GBP'
          ? { ...row, updatedAt: new Date('2026-05-05T10:00:00.000Z') }
          : row,
      ),
      now,
    );

    expect(convertToBaseCurrency(100, 'GBP', rates)).toBe(118);
  });

  test('ignores stale or invalid base-currency rows because EUR is synthetic', () => {
    const rates = buildRatesToBaseCurrency(
      [...completeRows, { fromCurrency: 'EUR', toCurrency: 'EUR', rate: '0', updatedAt: null }],
      now,
    );

    expect(rates.get('EUR')).toBe(1);
  });
});
