import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { budgetCategories, budgetTransactions, categoryMappings } from '../db/schema';
import { createIntegrationHelpers } from '../test/integration';
import type { BunqMonetaryAccount, BunqPayment } from '../lib/bunqClient';
import { importBudgetPaymentBatch } from './bunqBudgetSync';

const integration = createIntegrationHelpers('bunq-budget-batch.quro.test');
beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());
const account: BunqMonetaryAccount = {
  id: 17,
  type: 'BANK',
  description: 'Daily',
  balance: { value: '0', currency: 'EUR' },
  iban: null,
  status: 'ACTIVE',
};
function payment(id: number, date = '2026-10-01'): BunqPayment {
  return {
    id,
    amount: { value: '-10.00', currency: 'EUR' },
    description: 'Food',
    counterpartyAlias: {
      displayName: 'Shop',
      iban: null,
      merchantCategoryCode: '5411',
      bunqUserId: null,
    },
    created: date,
    type: 'CARD',
    subType: '',
  };
}

async function seedCategory(userId: number) {
  const [category] = await db
    .insert(budgetCategories)
    .values({
      userId,
      name: 'Custom groceries',
      budgeted: 250,
      spent: 10,
      month: 'Sep',
      year: 2026,
      emoji: 'G',
      color: '#123456',
    })
    .returning();
  await db
    .insert(categoryMappings)
    .values({ userId, source: 'mcc', sourceKey: '5411', categoryName: category.name });
  await db.insert(budgetTransactions).values({
    userId,
    categoryId: category.id,
    description: 'Food',
    amount: 10,
    date: '2026-09-01',
    merchant: 'Shop',
  });
  return category;
}

test('batched imports keep mappings, templates, manual matches and concurrent retries idempotent', async () => {
  const owner = await integration.signUp('batch');
  const category = await seedCategory(owner.user.id);
  const payments = [payment(1, '2026-09-01'), payment(2), payment(3), payment(3)];
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    const issues = await Promise.all(
      Array.from({ length: 3 }, () =>
        importBudgetPaymentBatch(owner.user.id, payments, account, new Set(), '9'),
      ),
    );
    expect(issues).toEqual([[], [], []]);
    expect(warnings).toHaveLength(0);
  } finally {
    console.warn = originalWarn;
  }
  const rows = await db
    .select()
    .from(budgetTransactions)
    .where(eq(budgetTransactions.userId, owner.user.id));
  expect(rows).toHaveLength(3);
  expect(rows.map((row) => row.bunqTransactionId).sort()).toEqual(['1', '2', '3']);
  expect(rows.find((row) => row.bunqTransactionId === '1')?.categoryId).toBe(category.id);
  const [october] = await db
    .select()
    .from(budgetCategories)
    .where(and(eq(budgetCategories.userId, owner.user.id), eq(budgetCategories.month, 'Oct')));
  expect(october).toMatchObject({
    name: category.name,
    budgeted: 250,
    spent: 20,
    color: '#123456',
    emoji: 'G',
  });
  const [september] = await db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.id, category.id));
  expect(september.spent).toBe(10);
  expect(
    await db
      .select()
      .from(budgetTransactions)
      .where(
        and(
          eq(budgetTransactions.userId, owner.user.id),
          isNull(budgetTransactions.bunqTransactionId),
        ),
      ),
  ).toHaveLength(0);
});

test('repairs ambiguous legacy transactions and only adds the amount difference', async () => {
  const owner = await integration.signUp('legacy');
  const category = await seedCategory(owner.user.id);
  await db.insert(budgetTransactions).values({
    userId: owner.user.id,
    categoryId: category.id,
    description: 'Food',
    amount: 5,
    date: '2026-09-01',
    merchant: 'Shop',
    bunqTransactionId: '1',
    currencyNeedsReview: true,
  });
  await db.update(budgetCategories).set({ spent: 15 }).where(eq(budgetCategories.id, category.id));
  expect(
    await importBudgetPaymentBatch(
      owner.user.id,
      [payment(1, '2026-09-01')],
      account,
      new Set(),
      '9',
    ),
  ).toEqual([]);
  const [repaired] = await db
    .select()
    .from(budgetTransactions)
    .where(
      and(
        eq(budgetTransactions.userId, owner.user.id),
        eq(budgetTransactions.bunqTransactionId, '1'),
      ),
    );
  expect(repaired).toMatchObject({
    amount: 10,
    sourceAmount: 10,
    sourceCurrency: 'EUR',
    currencyNeedsReview: false,
  });
  const [updated] = await db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.id, category.id));
  expect(updated.spent).toBe(20);
});
