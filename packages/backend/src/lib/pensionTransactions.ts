import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { pensionPots } from '../db/schema';

// Net effect of a pension transaction on its pot's balance.
export function computePensionTransactionDelta(txn: {
  type: string;
  amount: number;
  taxAmount: number;
}): number {
  if (txn.type === 'contribution') return txn.amount - txn.taxAmount;
  if (txn.type === 'fee') return -txn.amount;
  if (txn.type === 'annual_statement') return txn.amount;
  return 0;
}

// Apply a signed delta to a pension pot's balance in a single atomic UPDATE.
export async function applyPensionPotBalanceDelta(
  tx: DbExecutor,
  userId: number,
  potId: number,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  await tx
    .update(pensionPots)
    .set({ balance: sql`CAST(${pensionPots.balance} AS numeric) + ${delta}` })
    .where(and(eq(pensionPots.id, potId), eq(pensionPots.userId, userId)));
}
