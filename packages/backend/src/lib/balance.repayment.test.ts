import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { debts } from '../db/schema';
import { createIntegrationHelpers } from '../test/integration';
import { applyRepayment, DEBT_BALANCE, reverseRepayment } from './balance';

const integration = createIntegrationHelpers('balance-repayment.quro.test');

async function createDebt(userId: number, remainingBalance: number): Promise<number> {
  const [debt] = await db
    .insert(debts)
    .values({
      userId,
      name: 'Loan',
      type: 'personal',
      lender: 'Bank',
      originalAmount: 1000,
      remainingBalance,
      currency: 'EUR',
      interestRate: 3,
      monthlyPayment: 50,
      startDate: '2026-01-01',
      color: 'blue',
      emoji: '💳',
    })
    .returning({ id: debts.id });
  return debt.id;
}

async function readBalance(debtId: number): Promise<number> {
  const [debt] = await db.select().from(debts).where(eq(debts.id, debtId));
  return debt.remainingBalance;
}

describe('applyRepayment / reverseRepayment', () => {
  beforeAll(async () => {
    await integration.cleanup();
  });

  afterAll(async () => {
    await integration.cleanup();
  });

  test('reduces the balance, restores it, and enforces the overdraw guard and owner scope', async () => {
    const owner = await integration.signUp('owner');
    const other = await integration.signUp('other');
    const debtId = await createDebt(owner.user.id, 100);
    const ownerScope = eq(debts.userId, owner.user.id);

    const applied = await db.transaction((tx) =>
      applyRepayment(tx, DEBT_BALANCE, { id: debtId, principal: 40, where: ownerScope }),
    );
    expect(applied).toBe(60);
    expect(await readBalance(debtId)).toBe(60);

    // Principal beyond the balance (plus the 0.01 tolerance) is rejected untouched.
    const rejected = await db.transaction((tx) =>
      applyRepayment(tx, DEBT_BALANCE, { id: debtId, principal: 60.5, where: ownerScope }),
    );
    expect(rejected).toBeNull();
    expect(await readBalance(debtId)).toBe(60);

    // Within tolerance the balance is clamped at zero rather than going negative.
    const clamped = await db.transaction((tx) =>
      applyRepayment(tx, DEBT_BALANCE, { id: debtId, principal: 60.01, where: ownerScope }),
    );
    expect(clamped).toBe(0);

    // Another user's scope matches no row.
    const foreign = await db.transaction((tx) =>
      reverseRepayment(tx, DEBT_BALANCE, {
        id: debtId,
        principal: 10,
        where: eq(debts.userId, other.user.id),
      }),
    );
    expect(foreign).toBeNull();
    expect(await readBalance(debtId)).toBe(0);

    const restored = await db.transaction((tx) =>
      reverseRepayment(tx, DEBT_BALANCE, { id: debtId, principal: 40, where: ownerScope }),
    );
    expect(restored).toBe(40);
    expect(await readBalance(debtId)).toBe(40);
  });
});
