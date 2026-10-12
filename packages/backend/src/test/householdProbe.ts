import { eq } from 'drizzle-orm';
import { closeMaintenanceGate } from '../lib/maintenanceMode';
import { db, queryClient } from '../db/client';
import { DEMO_PARTNER_EMAIL, DEMO_USER_EMAIL } from '../db/maintenance';
import { openHouseholdApi } from '../db/householdApi';
import { users } from '../db/schema';

// Reads what the pages read for each demo user and prints it as JSON, for tests that need to see
// the seeded household through the application's own routes in a database of their own. Run it
// with DATABASE_URL pointing at that database.

const PATHS = [
  '/api/dashboard/summary',
  '/api/dashboard/allocations',
  '/api/plan/runway',
  '/api/savings/accounts',
  '/api/investments/properties',
  '/api/mortgages',
  '/api/pensions/pots',
  '/api/debts',
] as const;

async function probe(email: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`No user ${email}`);
  const api = await openHouseholdApi(user.id);
  try {
    const entries = await Promise.all(
      PATHS.map(async (path) => [path, await api.get(path)] as const),
    );
    return Object.fromEntries(entries);
  } finally {
    await api.close();
  }
}

try {
  const result = { demo: await probe(DEMO_USER_EMAIL), partner: await probe(DEMO_PARTNER_EMAIL) };
  console.log(JSON.stringify(result));
} finally {
  await closeMaintenanceGate();
  await queryClient.end({ timeout: 5 });
}
