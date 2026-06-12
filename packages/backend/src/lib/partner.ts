import { and, eq, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { partnerLinks } from '../db/schema';

export async function getAcceptedPartnerId(userId: number): Promise<number | null> {
  const [link] = await db
    .select({ requesterId: partnerLinks.requesterId, addresseeId: partnerLinks.addresseeId })
    .from(partnerLinks)
    .where(
      and(
        eq(partnerLinks.status, 'accepted'),
        or(eq(partnerLinks.requesterId, userId), eq(partnerLinks.addresseeId, userId)),
      ),
    );
  if (!link) return null;
  return link.requesterId === userId ? link.addresseeId : link.requesterId;
}

type JointScopedTable = {
  userId: PgColumn;
  isJoint: PgColumn;
};

export function ownedOrJointPredicate(
  table: JointScopedTable,
  userId: number,
  partnerId: number | null,
): SQL {
  const owned = eq(table.userId, userId);
  if (partnerId === null) return owned;
  const jointWithPartner = and(eq(table.userId, partnerId), eq(table.isJoint, true));
  return or(owned, jointWithPartner) as SQL;
}

export async function assertJointAllowed(
  userId: number,
  isJoint: boolean | undefined,
): Promise<string | null> {
  if (!isJoint) return null;
  const partnerId = await getAcceptedPartnerId(userId);
  return partnerId === null ? 'No partner linked' : null;
}
