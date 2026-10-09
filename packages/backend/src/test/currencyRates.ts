import { CURRENCY_CODES, toIsoDate } from '@quro/shared';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { currencyRates } from '../db/schema';

// Synthetic rates to EUR that integration tests compute their expected totals from.
export const FIXTURE_RATES_TO_EUR = {
  GBP: 1.18,
  USD: 0.92,
  AUD: 0.58,
  NZD: 0.53,
  CAD: 0.67,
  CHF: 1.04,
  SGD: 0.68,
} as const satisfies Record<Exclude<(typeof CURRENCY_CODES)[number], 'EUR'>, number>;

// Writes the fixture rates, dated today, over whatever the test database already holds (demo seed
// rates, provider rates from a smoke run or another suite), so expected totals never depend on
// which file or process wrote the table first.
export async function useFixtureCurrencyRates(provider: string): Promise<void> {
  const updatedAt = new Date();
  const sourceDate = toIsoDate(updatedAt);
  await db
    .insert(currencyRates)
    .values(
      Object.entries(FIXTURE_RATES_TO_EUR).map(([fromCurrency, rate]) => ({
        fromCurrency: fromCurrency as keyof typeof FIXTURE_RATES_TO_EUR,
        toCurrency: 'EUR' as const,
        rate,
        provider,
        sourceDate,
        updatedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [currencyRates.fromCurrency, currencyRates.toCurrency],
      set: {
        rate: sql`excluded.rate`,
        provider: sql`excluded.provider`,
        sourceDate: sql`excluded.source_date`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
