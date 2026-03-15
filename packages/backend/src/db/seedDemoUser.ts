import { eq } from 'drizzle-orm';
import { DEMO_USER_EMAIL } from './maintenance';
import { createDb } from './client';
import { getRuntimeDatabaseUrl } from './config';
import { currencyRates, users } from './schema';

const DEFAULT_DEMO_PASSWORD = 'password123';

// Approximate rates to EUR (2026 Q1). Used only when the table is empty so
// the frontend's currency-rates gate doesn't block CI smoke tests.
const SEED_RATES = [
  { fromCurrency: 'GBP' as const, toCurrency: 'EUR' as const, rate: '1.18' },
  { fromCurrency: 'USD' as const, toCurrency: 'EUR' as const, rate: '0.92' },
  { fromCurrency: 'AUD' as const, toCurrency: 'EUR' as const, rate: '0.58' },
  { fromCurrency: 'NZD' as const, toCurrency: 'EUR' as const, rate: '0.53' },
  { fromCurrency: 'CAD' as const, toCurrency: 'EUR' as const, rate: '0.67' },
  { fromCurrency: 'CHF' as const, toCurrency: 'EUR' as const, rate: '1.04' },
  { fromCurrency: 'SGD' as const, toCurrency: 'EUR' as const, rate: '0.68' },
];

async function ensureCurrencyRates(db: ReturnType<typeof createDb>['db']): Promise<void> {
  const [existing] = await db.select({ id: currencyRates.id }).from(currencyRates).limit(1);
  if (existing) return;

  const updatedAt = new Date().toISOString().slice(0, 10);
  await db.insert(currencyRates).values(SEED_RATES.map((r) => ({ ...r, updatedAt })));
  console.log(`Seeded ${SEED_RATES.length} currency rates.`);
}

async function seedDemoUser() {
  const { db, queryClient } = createDb(getRuntimeDatabaseUrl());
  try {
    const password = process.env.DEMO_USER_PASSWORD?.trim() || DEFAULT_DEMO_PASSWORD;
    const passwordHash = await Bun.password.hash(password, {
      algorithm: 'bcrypt',
      cost: 10,
    });

    const [existing] = await db.select().from(users).where(eq(users.email, DEMO_USER_EMAIL));

    if (existing) {
      await db
        .update(users)
        .set({
          firstName: existing.firstName || 'Demo',
          lastName: existing.lastName || 'User',
          passwordHash,
          numberFormat: existing.numberFormat || 'en-US',
          baseCurrency: existing.baseCurrency || 'EUR',
        })
        .where(eq(users.id, existing.id));
      console.log(`Demo user updated (${DEMO_USER_EMAIL}).`);
    } else {
      await db.insert(users).values({
        firstName: 'Demo',
        lastName: 'User',
        email: DEMO_USER_EMAIL,
        passwordHash,
        baseCurrency: 'EUR',
        numberFormat: 'en-US',
        age: 35,
        retirementAge: 67,
      });
      console.log(`Demo user created (${DEMO_USER_EMAIL}).`);
    }

    await ensureCurrencyRates(db);
  } finally {
    await queryClient.end();
  }
}

seedDemoUser().catch((error) => {
  console.error('Failed to seed demo user:', error);
  process.exit(1);
});
