import { inArray, isNull, and } from 'drizzle-orm';
import { db, type DbExecutor } from '../db/client';
import { mortgages } from '../db/schema';
import { toNumberOrZero } from './numbers';

type PropertyDebt = { mortgageId: number | null; mortgage: unknown };

// The caller supplies active balances (or balances active at a historical
// cutoff). Archived/missing links have no debt, matching net-worth semantics.
export function getPropertyDebt(
  property: PropertyDebt,
  mortgageBalances: ReadonlyMap<number, number>,
): number {
  return property.mortgageId === null
    ? toNumberOrZero(property.mortgage)
    : (mortgageBalances.get(property.mortgageId) ?? 0);
}

// Rows must already be access-checked. A linked mortgage can belong to the
// partner, so resolve through the property link rather than its row owner.
export async function resolvePropertyDebts<T extends PropertyDebt>(
  rows: readonly T[],
  executor: DbExecutor = db,
): Promise<Array<T & { mortgage: number }>> {
  const ids = rows.flatMap((row) => (row.mortgageId === null ? [] : [row.mortgageId]));
  const linked =
    ids.length === 0
      ? []
      : await executor
          .select({
            id: mortgages.id,
            outstandingBalance: mortgages.outstandingBalance,
          })
          .from(mortgages)
          .where(and(inArray(mortgages.id, ids), isNull(mortgages.archivedAt)));
  const balances = new Map(linked.map((row) => [row.id, toNumberOrZero(row.outstandingBalance)]));
  return rows.map((row) => ({ ...row, mortgage: getPropertyDebt(row, balances) }));
}
