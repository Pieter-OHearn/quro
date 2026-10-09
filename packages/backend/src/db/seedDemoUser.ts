import { eq } from 'drizzle-orm';
import { bootConfig } from '../config';
import { createDb } from './client';
import { getRuntimeDatabaseUrl } from './config';
import { buildSeedCurrencyRates, DEFAULT_DEMO_PASSWORD, DEMO_USER_PROFILE } from './demoSeed';
import { currencyRates, users } from './schema';

async function ensureCurrencyRates(db: ReturnType<typeof createDb>['db']): Promise<void> {
  const [existing] = await db.select({ id: currencyRates.id }).from(currencyRates).limit(1);
  if (existing) return;

  const rates = buildSeedCurrencyRates(new Date());
  await db.insert(currencyRates).values(rates);
  console.log(`Seeded ${rates.length} currency rates.`);
}

async function seedDemoUser() {
  const { demo } = bootConfig('seed');
  const { db, queryClient } = createDb(getRuntimeDatabaseUrl());
  try {
    const password = demo.userPassword?.reveal() ?? DEFAULT_DEMO_PASSWORD;
    const passwordHash = await Bun.password.hash(password, {
      algorithm: 'bcrypt',
      cost: 10,
    });

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEMO_USER_PROFILE.email));

    if (existing) {
      // Reset to the fixed profile so every seeded database starts from the same state.
      await db
        .update(users)
        .set({ ...DEMO_USER_PROFILE, passwordHash })
        .where(eq(users.id, existing.id));
      console.log(`Demo user updated (${DEMO_USER_PROFILE.email}).`);
    } else {
      await db.insert(users).values({ ...DEMO_USER_PROFILE, passwordHash });
      console.log(`Demo user created (${DEMO_USER_PROFILE.email}).`);
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
