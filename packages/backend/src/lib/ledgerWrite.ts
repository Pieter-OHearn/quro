import { and, eq, gte, inArray } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { HTTP_STATUS } from '../constants/http';
import type { DbTransaction } from '../db/client';
import { netWorthSnapshots } from '../db/schema';
import type { JointTable } from './access';
import { monthStart } from './netWorth';

type LedgerEntity = { userId: number; isJoint?: boolean; partnerId?: number | null };
type LedgerParent = { table: JointTable; id: number; partnerId: number | null; actorId: number };

async function affectedUsers(
  tx: DbTransaction,
  entity: LedgerEntity | LedgerParent,
): Promise<number[]> {
  if ('table' in entity) {
    const [row] = await tx
      .select({ userId: entity.table.userId, isJoint: entity.table.isJoint })
      .from(entity.table)
      .where(eq(entity.table.id, entity.id));
    if (!row) return [];
    const ownerId = row.userId as number;
    const otherId = ownerId === entity.actorId ? entity.partnerId : entity.actorId;
    return row.isJoint === true && otherId !== null ? [ownerId, otherId] : [ownerId];
  }
  return entity.isJoint && entity.partnerId != null
    ? [entity.userId, entity.partnerId]
    : [entity.userId];
}

// Run inside the ledger transaction, after the write succeeds. Parent references
// include both old and new parents when a transaction moves between accounts.
export async function withLedgerWrite(
  tx: DbTransaction,
  entity: LedgerEntity | LedgerParent | readonly (LedgerEntity | LedgerParent)[],
  date: string,
): Promise<void> {
  const entities = Array.isArray(entity) ? entity : [entity];
  const affected = await Promise.all(entities.map((entry) => affectedUsers(tx, entry)));
  const userIds = [...new Set(affected.flat())];
  if (userIds.length === 0) return;
  await tx
    .delete(netWorthSnapshots)
    .where(
      and(
        inArray(netWorthSnapshots.userId, userIds),
        gte(netWorthSnapshots.snapshotDate, monthStart(date)),
      ),
    );
}

/**
 * Thrown inside a ledger transaction to undo every statement run so far. Returning an error
 * object from `db.transaction` commits them, which would keep an edit's reversal of the old
 * balance effect even though the edit was refused.
 */
export class LedgerEditRejected<T> extends Error {
  constructor(readonly rejection: T) {
    super('Ledger edit rejected');
  }
}

/** Runs a transaction and answers with the rejection when it threw `LedgerEditRejected`. */
export async function answerRejectedEdit<T, R>(run: () => Promise<T>): Promise<T | R> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof LedgerEditRejected) return error.rejection as R;
    throw error;
  }
}

export type LedgerRejection = {
  error: string;
  status:
    typeof HTTP_STATUS.BAD_REQUEST | typeof HTTP_STATUS.NOT_FOUND | typeof HTTP_STATUS.CONFLICT;
};

/** Answer (409) when a ledger row moved to another parent between its access check and its lock. */
export const LEDGER_ROW_CHANGED =
  'Transaction changed while it was being edited; reload it and try again';

/**
 * Locks one ledger row until the transaction ends and returns its committed values, or null
 * when it no longer exists. Edits and deletes reverse a row's balance effect from these values:
 * a second edit or delete of the same row then waits for the first and sees its result, instead
 * of reversing an effect that has already been reversed. Check access before calling this.
 */
export async function lockLedgerRow<T extends PgTable & { id: PgColumn }>(
  tx: DbTransaction,
  table: T,
  id: number,
): Promise<T['$inferSelect'] | null> {
  const [row] = await tx
    .select()
    .from(table as PgTable)
    .where(eq(table.id, id))
    .for('update');
  return (row as T['$inferSelect'] | undefined) ?? null;
}

/**
 * `lockLedgerRow` for a row whose access was checked through its parent before the transaction.
 * Throws `LedgerEditRejected` (so the transaction rolls back) when the row is gone or has moved
 * to another parent since that check.
 */
export async function lockCheckedLedgerRow<T extends PgTable & { id: PgColumn }>(
  tx: DbTransaction,
  table: T,
  id: number,
  hasCheckedParent: (row: T['$inferSelect']) => boolean,
): Promise<T['$inferSelect']> {
  const row = await lockLedgerRow(tx, table, id);
  if (!row) {
    throw new LedgerEditRejected<LedgerRejection>({
      error: 'Transaction not found',
      status: HTTP_STATUS.NOT_FOUND,
    });
  }
  if (!hasCheckedParent(row)) {
    throw new LedgerEditRejected<LedgerRejection>({
      error: LEDGER_ROW_CHANGED,
      status: HTTP_STATUS.CONFLICT,
    });
  }
  return row;
}
