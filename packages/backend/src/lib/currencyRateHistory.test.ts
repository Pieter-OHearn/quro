import { describe, expect, test } from 'bun:test';
import {
  buildHistoricalCurrencyRateResolver,
  type HistoricalCurrencyRateRow,
} from './currencyRateHistory';

const CURRENT_RATES = new Map<string, number>([
  ['EUR', 1],
  ['GBP', 1.2],
  ['USD', 0.9],
]);

function buildRate(overrides: Partial<HistoricalCurrencyRateRow>): HistoricalCurrencyRateRow {
  return {
    fromCurrency: 'GBP',
    toCurrency: 'EUR',
    rate: 1.1,
    rateDate: '2025-01-31',
    provider: 'fixture',
    syncedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('historical currency rate resolver', () => {
  test('uses the nearest previous historical rate for dated conversion', () => {
    const resolver = buildHistoricalCurrencyRateResolver(
      [
        buildRate({ rate: 1.05, rateDate: '2025-01-31' }),
        buildRate({ rate: 1.15, rateDate: '2025-03-31' }),
      ],
      CURRENT_RATES,
    );

    const conversion = resolver.convertToBase(100, 'GBP', '2025-04-15');

    expect(conversion).toEqual({
      value: 114.99999999999999,
      rateDate: '2025-03-31',
      estimated: true,
    });
    expect(resolver.getCoverage()).toEqual({
      missingCurrencies: [],
      estimatedDates: ['2025-04-15'],
    });
  });

  test('falls back to the current rate and marks coverage when history is missing', () => {
    const resolver = buildHistoricalCurrencyRateResolver([], CURRENT_RATES);

    const conversion = resolver.convertToBase(100, 'USD', '2025-04-15');

    expect(conversion).toEqual({ value: 90, rateDate: null, estimated: true });
    expect(resolver.getCoverage()).toEqual({
      missingCurrencies: ['USD'],
      estimatedDates: ['2025-04-15'],
    });
  });
});
