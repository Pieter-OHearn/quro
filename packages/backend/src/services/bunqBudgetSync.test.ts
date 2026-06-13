import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, inArray, like } from 'drizzle-orm';
import { db } from '../db/client';
import { budgetCategories, users } from '../db/schema';
import { findOrCreateCategoryByName } from './bunqBudgetSync';

const EMAIL_DOMAIN = 'bunq-budget-sync.quro.test';

beforeAll(async () => {
  await cleanupTestUsers();
});

afterAll(async () => {
  await cleanupTestUsers();
});

async function cleanupTestUsers() {
  const testUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `%@${EMAIL_DOMAIN}`));
  const userIds = testUsers.map((user) => user.id);
  if (userIds.length === 0) return;

  await db.delete(budgetCategories).where(inArray(budgetCategories.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

async function createTestUser(label: string) {
  const [user] = await db
    .insert(users)
    .values({
      firstName: 'Budget',
      lastName: 'Sync',
      email: `${label}-${crypto.randomUUID()}@${EMAIL_DOMAIN}`,
      passwordHash: 'test-password-hash',
      age: 32,
      retirementAge: 67,
    })
    .returning({ id: users.id });

  if (!user) throw new Error('Expected test user to be created');
  return user;
}

describe('Bunq budget sync categories', () => {
  test('inherits the latest non-zero category budget when creating a monthly snapshot', async () => {
    const owner = await createTestUser('category-template');

    await db.insert(budgetCategories).values({
      userId: owner.id,
      name: 'Groceries',
      emoji: 'G',
      budgeted: 420,
      spent: 185,
      color: '#111827',
      month: 'Mar',
      year: 2026,
    });

    const categoryId = await db.transaction((tx) =>
      findOrCreateCategoryByName(tx, owner.id, 'Groceries', 'Apr', 2026),
    );
    const [category] = await db
      .select()
      .from(budgetCategories)
      .where(eq(budgetCategories.id, categoryId));

    if (!category) throw new Error('Expected April Groceries category to be created');
    expect(Number(category.budgeted)).toBe(420);
    expect(Number(category.spent)).toBe(0);
    expect(category.emoji).toBe('G');
    expect(category.color).toBe('#111827');
  });

  test('keeps preset defaults when no category budget exists yet', async () => {
    const owner = await createTestUser('category-default');

    const categoryId = await db.transaction((tx) =>
      findOrCreateCategoryByName(tx, owner.id, 'Transport', 'Apr', 2026),
    );
    const [category] = await db
      .select()
      .from(budgetCategories)
      .where(eq(budgetCategories.id, categoryId));

    if (!category) throw new Error('Expected April Transport category to be created');
    expect(Number(category.budgeted)).toBe(0);
    expect(Number(category.spent)).toBe(0);
    expect(category.emoji).toBe('🚌');
    expect(category.color).toBe('#3b82f6');
  });
});
