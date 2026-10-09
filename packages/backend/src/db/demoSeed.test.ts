import { describe, expect, test } from 'bun:test';
import { buildSeedCurrencyRates, DEMO_USER_PROFILE, SEED_RATE_PROVIDER } from './demoSeed';

const FIXED_NOW = new Date('2026-03-15T12:00:00.000Z');

describe('demo seed', () => {
  test('builds the same currency rates for the same clock', () => {
    expect(buildSeedCurrencyRates(FIXED_NOW)).toEqual(buildSeedCurrencyRates(new Date(FIXED_NOW)));
  });

  test('dates every rate on the seeding day and marks it as seeded', () => {
    const rates = buildSeedCurrencyRates(FIXED_NOW);
    expect(rates.length).toBeGreaterThan(0);
    for (const rate of rates) {
      expect(rate.provider).toBe(SEED_RATE_PROVIDER);
      expect(rate.sourceDate).toBe('2026-03-15');
      expect(rate.updatedAt).toEqual(FIXED_NOW);
      expect(rate.toCurrency).toBe('EUR');
      expect(rate.fromCurrency).not.toBe('EUR');
      expect(Number.isFinite(rate.rate) && rate.rate > 0).toBe(true);
    }
    expect(new Set(rates.map((rate) => rate.fromCurrency)).size).toBe(rates.length);
  });

  test('uses a fixed synthetic profile on a non-routable domain', () => {
    expect(DEMO_USER_PROFILE).toEqual({
      firstName: 'Demo',
      lastName: 'User',
      email: 'demo@quro.local',
      baseCurrency: 'EUR',
      numberFormat: 'en-US',
      age: 35,
      retirementAge: 67,
    });
  });
});
