import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { savingsAccounts } from '../db/schema';
import { parseNumber } from './requestValidation';

type SavingsBalanceDb = Pick<typeof db, 'update'>;

export function toFiniteNumber(value: unknown): number {
  const parsed = parseNumber(value);
  return parsed ?? 0;
}

export function toSignedSavingsAmount(type: unknown, amount: unknown): number {
  const absoluteAmount = Math.abs(toFiniteNumber(amount));
  return type === 'withdrawal' ? -absoluteAmount : absoluteAmount;
}

// Callers must verify the actor can access the account (owned or joint) before
// invoking this; the update itself is intentionally not user-scoped so partner
// transactions on joint accounts still adjust the balance.
export async function updateSavingsAccountBalanceByDelta(
  client: SavingsBalanceDb,
  accountId: number,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  await client
    .update(savingsAccounts)
    .set({
      balance: sql`CAST(${savingsAccounts.balance} AS numeric) + ${delta}`,
    })
    .where(eq(savingsAccounts.id, accountId));
}
