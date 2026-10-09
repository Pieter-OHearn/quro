import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { savingsAccounts, savingsTransactions } from '../db/schema';
import { moneyLimitError } from '../lib/requestValidation';
import { createIntegrationHelpers, type AuthSession } from '../test/integration';

const integration = createIntegrationHelpers('unstorable-values.integration.quro.test');
const REFUSED = { error: 'A value in the request cannot be stored' };

let owner: AuthSession;
let accountId: number;

beforeAll(async () => {
  await integration.cleanup();
  owner = await integration.signUp('owner');
  const [account] = await db
    .insert(savingsAccounts)
    .values({
      userId: owner.user.id,
      name: 'Synthetic account',
      bank: 'Synthetic bank',
      balance: 100,
      currency: 'EUR',
      interestRate: 1,
      accountType: 'Easy Access',
    })
    .returning();
  accountId = account!.id;
});

afterAll(() => integration.cleanup());

describe('values the database cannot store', () => {
  test('a NUL character in text is a 400 and leaves the row alone', async () => {
    const response = await integration.request(`/api/savings/accounts/${accountId}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json: { name: 'before\u0000after' },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(REFUSED);

    const [row] = await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, accountId));
    expect(row!.name).toBe('Synthetic account');
  });

  test('a number beyond the column range is a 400 and writes nothing', async () => {
    // Money is bounded when it is parsed (D38), so a rate column shows the database refusal.
    const response = await integration.request(`/api/savings/accounts/${accountId}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      json: { interestRate: 1e6 },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(REFUSED);
    const [row] = await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, accountId));
    expect(row!.interestRate).toBe(1);
  });

  test('a money amount beyond the money limit is refused before it reaches the database', async () => {
    const response = await integration.request('/api/savings/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: { accountId, type: 'deposit', amount: 1e21, date: '2026-03-02' },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: moneyLimitError('amount') });

    const rows = await db
      .select()
      .from(savingsTransactions)
      .where(eq(savingsTransactions.accountId, accountId));
    expect(rows).toHaveLength(0);
    const [row] = await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, accountId));
    expect(row!.balance).toBe(100);
  });

  test('ordinary values still work', async () => {
    const response = await integration.request('/api/savings/transactions', {
      method: 'POST',
      cookie: owner.cookie,
      json: { accountId, type: 'deposit', amount: 25, date: '2026-03-02' },
    });
    expect(response.status).toBe(201);
  });
});
