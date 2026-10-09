import { toIsoDate } from '@quro/shared';
import { DEMO_USER_EMAIL } from './maintenance';

// Synthetic demo data for local development, smoke tests and screenshots. Every value is
// fixed so repeated seeding produces the same profile; only the rate date follows the
// clock, so the seeded rates count as fresh.

export const DEFAULT_DEMO_PASSWORD = 'password123';

export const DEMO_USER_PROFILE = {
  firstName: 'Demo',
  lastName: 'User',
  email: DEMO_USER_EMAIL,
  baseCurrency: 'EUR',
  numberFormat: 'en-US',
  age: 35,
  retirementAge: 67,
} as const;

// Approximate rates to EUR (2026 Q1). Used only when the table is empty so
// the frontend's currency-rates gate doesn't block CI smoke tests.
export const SEED_RATE_PROVIDER = 'seed';
const SEED_RATES = [
  { fromCurrency: 'GBP' as const, toCurrency: 'EUR' as const, rate: 1.18 },
  { fromCurrency: 'USD' as const, toCurrency: 'EUR' as const, rate: 0.92 },
  { fromCurrency: 'AUD' as const, toCurrency: 'EUR' as const, rate: 0.58 },
  { fromCurrency: 'NZD' as const, toCurrency: 'EUR' as const, rate: 0.53 },
  { fromCurrency: 'CAD' as const, toCurrency: 'EUR' as const, rate: 0.67 },
  { fromCurrency: 'CHF' as const, toCurrency: 'EUR' as const, rate: 1.04 },
  { fromCurrency: 'SGD' as const, toCurrency: 'EUR' as const, rate: 0.68 },
];

export function buildSeedCurrencyRates(now: Date) {
  const sourceDate = toIsoDate(now);
  return SEED_RATES.map((rate) => ({
    ...rate,
    provider: SEED_RATE_PROVIDER,
    sourceDate,
    updatedAt: now,
  }));
}
