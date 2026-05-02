import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { savingsAccounts } from '../db/schema';
import { parseNumber } from './requestValidation';

export function toFiniteNumber(value: unknown): number {
  const parsed = parseNumber(value);
  return parsed ?? 0;
}

export function toSignedSavingsAmount(type: unknown, amount: unknown): number {
  const absoluteAmount = Math.abs(toFiniteNumber(amount));
  return type === 'withdrawal' ? -absoluteAmount : absoluteAmount;
}

export async function updateSavingsAccountBalanceByDelta(
  accountId: number,
  userId: number,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  await db
    .update(savingsAccounts)
    .set({
      balance: sql`CAST(${savingsAccounts.balance} AS numeric) + ${delta}`,
    })
    .where(and(eq(savingsAccounts.id, accountId), eq(savingsAccounts.userId, userId)));
}
