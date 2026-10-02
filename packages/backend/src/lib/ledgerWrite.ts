import { and, eq, gte, inArray } from 'drizzle-orm';
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
