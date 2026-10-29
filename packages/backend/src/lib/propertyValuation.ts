import { toIsoDate } from '@quro/shared';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { db, type DbExecutor, type DbTransaction } from '../db/client';
import { properties, propertyTransactions } from '../db/schema';
import { lockLedgerParents } from './ledgerWrite';

// A valuation counts from its date: a property's current value is its latest valuation dated on
// or before today (UTC, the calendar the net worth history uses), ties by id. One dated later
// takes effect when its date comes, applied by `applyDueValuations`.

/** Today's calendar date in UTC, the last date whose valuations are in effect. */
function valuationDate(now = new Date()): string {
  return toIsoDate(now);
}

/** The amount of the property's latest valuation in effect on `asOf`, or null without one. */
export async function latestValuation(
  executor: DbExecutor,
  propertyId: number,
  asOf = valuationDate(),
): Promise<number | null> {
  const [latest] = await executor
    .select({ amount: propertyTransactions.amount })
    .from(propertyTransactions)
    .where(
      and(
        eq(propertyTransactions.propertyId, propertyId),
        eq(propertyTransactions.type, 'valuation'),
        lte(propertyTransactions.date, asOf),
      ),
    )
    .orderBy(desc(propertyTransactions.date), desc(propertyTransactions.id))
    .limit(1);
  return latest?.amount ?? null;
}

/**
 * Sets each property's current value to its latest valuation in effect. Call it inside the ledger
 * transaction after the properties were locked, so writes on one property apply one after
 * another. A property without a valuation in effect keeps the value it has, which is the value it
 * was entered or last valued at.
 */
export async function syncCurrentValue(
  tx: DbTransaction,
  propertyIds: readonly number[],
  asOf = valuationDate(),
): Promise<void> {
  for (const propertyId of new Set(propertyIds)) {
    const amount = await latestValuation(tx, propertyId, asOf);
    if (amount === null) continue;
    await tx.update(properties).set({ currentValue: amount }).where(eq(properties.id, propertyId));
  }
}

/**
 * Applies the valuations whose date has come: every property whose current value is not its
 * latest valuation in effect is locked and brought up to date, one transaction each, in the order
 * a valuation write uses. Returns how many properties changed.
 */
export async function applyDueValuations(asOf = valuationDate()): Promise<number> {
  const due = await db.execute<{ property_id: number }>(sql`
    select latest.property_id from (
      select distinct on (${propertyTransactions.propertyId})
        ${propertyTransactions.propertyId} as property_id, ${propertyTransactions.amount} as amount
      from ${propertyTransactions}
      where ${propertyTransactions.type} = 'valuation' and ${propertyTransactions.date} <= ${asOf}
      order by ${propertyTransactions.propertyId}, ${propertyTransactions.date} desc,
        ${propertyTransactions.id} desc
    ) as latest
    join ${properties} on ${properties.id} = latest.property_id
    where ${properties.currentValue} is distinct from latest.amount
  `);
  for (const { property_id: propertyId } of due) {
    await db.transaction(async (tx) => {
      await lockLedgerParents(tx, properties, [propertyId]);
      await syncCurrentValue(tx, [propertyId], asOf);
    });
  }
  return due.length;
}
