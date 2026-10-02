import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { partnerLinks } from '../db/schema';
import { toNumberOrZero } from './numbers';

export type HouseholdWeight = 'personal' | 'full';

// Full balances are used only for explicit liquidity scenarios. Contractual
// payments, net worth and deposit protection always use the personal share.
export function householdShare(
  isJoint: boolean | undefined,
  weight: HouseholdWeight = 'personal',
): number {
  return isJoint && weight === 'personal' ? 0.5 : 1;
}

const HOUSEHOLD_MONEY_COLUMNS = {
  savings: ['balance'],
  savingsTransactions: ['amount'],
  properties: ['purchasePrice', 'currentValue', 'mortgage'],
  propertyTransactions: ['amount', 'interest', 'principal'],
  mortgages: ['outstandingBalance', 'monthlyPayment', 'originalAmount', 'propertyValue'],
} as const;

export function scopeHouseholdRows<T extends object>(
  kind: keyof typeof HOUSEHOLD_MONEY_COLUMNS,
  rows: readonly T[],
  isJoint: (row: T) => boolean,
  weight: HouseholdWeight = 'personal',
): T[] {
  const fields: readonly string[] = HOUSEHOLD_MONEY_COLUMNS[kind];
  return rows.map((row) => {
    const share = householdShare(isJoint(row), weight);
    if (share === 1) return row;
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        fields.includes(key) && value != null ? toNumberOrZero(value) * share : value,
      ]),
    ) as T;
  });
}

export async function loadHouseholdRows<
  T extends PgTable & JointScopedTable & { archivedAt: PgColumn },
>(
  table: T,
  userId: number,
  partnerId: number | null,
  options: { includeArchived?: boolean } = {},
): Promise<T['$inferSelect'][]> {
  const rows = await db
    .select()
    .from(table as PgTable)
    .where(
      and(
        ownedOrJointPredicate(table, userId, partnerId),
        options.includeArchived ? undefined : isNull(table.archivedAt),
      ),
    );
  return rows as T['$inferSelect'][];
}

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

export function assertJointAllowed(
  partnerId: number | null,
  isJoint: boolean | undefined,
): string | null {
  return isJoint && partnerId === null ? 'No partner linked' : null;
}
