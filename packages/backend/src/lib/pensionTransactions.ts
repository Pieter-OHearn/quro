import { pensionTransactionDelta } from '@quro/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/client';
import { pensionPots } from '../db/schema';

// Net effect of a pension transaction on its pot's balance (the shared rule the frontend uses).
export const computePensionTransactionDelta = pensionTransactionDelta;

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
