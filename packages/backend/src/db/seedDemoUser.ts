import { eq } from 'drizzle-orm';
import { bootConfig } from '../config';
import { closeMaintenanceGate } from '../lib/maintenanceMode';
import { db, queryClient } from './client';
import {
  buildSeedCurrencyRates,
  DEFAULT_DEMO_PASSWORD,
  DEMO_USER_PROFILE,
  parseSeedArguments,
} from './demoSeed';
import { currencyRates, users } from './schema';

// Bun.argv is [runtime, script, ...arguments].
const SCRIPT_ARGUMENTS_START = 2;

async function ensureCurrencyRates(): Promise<void> {
  const [existing] = await db.select({ id: currencyRates.id }).from(currencyRates).limit(1);
  if (existing) return;

  const rates = buildSeedCurrencyRates(new Date());
  await db.insert(currencyRates).values(rates);
  console.log(`Seeded ${rates.length} currency rates.`);
}

async function upsertUser(
  label: string,
  profile: Omit<typeof users.$inferInsert, 'id' | 'passwordHash'> & { email: string },
  passwordHash: string,
): Promise<number> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, profile.email));

  if (existing) {
    // Reset to the fixed profile so every seeded database starts from the same state.
    await db
      .update(users)
      .set({ ...profile, passwordHash })
      .where(eq(users.id, existing.id));
    console.log(`${label} updated (${profile.email}).`);
    return existing.id;
  }
  const [created] = await db
    .insert(users)
    .values({ ...profile, passwordHash })
    .returning({ id: users.id });
  console.log(`${label} created (${profile.email}).`);
  return created!.id;
}

async function seedHouseholdFor(demoId: number, passwordHash: string): Promise<void> {
  const { DEMO_PARTNER_PROFILE } = await import('./demoHousehold');
  const { seedHousehold } = await import('./seedHousehold');
  const partnerId = await upsertUser('Demo partner', DEMO_PARTNER_PROFILE, passwordHash);
  const summary = await seedHousehold(
    { demo: demoId, partner: partnerId },
    DEMO_PARTNER_PROFILE.email,
  );
  console.log(
    `Demo household seeded through the app's routes (${summary.requests} requests): ` +
      `${DEMO_USER_PROFILE.email} and ${DEMO_PARTNER_PROFILE.email} are linked partners.`,
  );
}

async function seedDemoUser(options: { household: boolean }) {
  const { demo } = bootConfig('seed');
  const password = demo.userPassword?.reveal() ?? DEFAULT_DEMO_PASSWORD;
  const passwordHash = await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: 10,
  });

  // The household seed writes nothing, not even the demo user, in a database that holds anyone else.
  if (options.household) await (await import('./seedHousehold')).assertOnlyDemoUsers();

  const demoId = await upsertUser('Demo user', DEMO_USER_PROFILE, passwordHash);
  await ensureCurrencyRates();
  if (options.household) await seedHouseholdFor(demoId, passwordHash);
}

async function main(): Promise<number> {
  try {
    await seedDemoUser(parseSeedArguments(Bun.argv.slice(SCRIPT_ARGUMENTS_START)));
    return 0;
  } catch (error) {
    if (error instanceof Error && error.name === 'HouseholdSeedRefusedError') {
      console.error(error.message);
    } else {
      console.error('Failed to seed demo user:', error);
    }
    return 1;
  } finally {
    await closeMaintenanceGate();
    await queryClient.end({ timeout: 5 });
  }
}

process.exit(await main());
