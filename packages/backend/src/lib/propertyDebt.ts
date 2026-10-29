import { inArray, isNull, and } from 'drizzle-orm';
import { propertyEquity, roundMoney, type PropertyDebtSource } from '@quro/shared';
import { db, type DbExecutor } from '../db/client';
import { mortgages } from '../db/schema';
import { toNumberOrZero } from './numbers';

type PropertyDebtLink = { mortgageId: number | null };
type PropertyEquityRow = PropertyDebtLink & { currentValue: unknown; isJoint: boolean };

// A property's only debt is its linked mortgage. The caller supplies active balances (or
// balances active at a historical cutoff); an archived or missing link has no debt, matching
// net-worth semantics.
export function getPropertyDebt(
  property: PropertyDebtLink,
  mortgageBalances: ReadonlyMap<number, number>,
): number {
  return property.mortgageId === null ? 0 : (mortgageBalances.get(property.mortgageId) ?? 0);
}

// Rows must already be access-checked. A linked mortgage can belong to the partner, so it is
// resolved through the property link rather than its row owner. `debt` and `totalEquity` are the
// whole property's; `equity` weights the value and the debt by their own rows' household shares,
// exactly as the dashboard's net worth does.
export async function withPropertyEquity<T extends PropertyEquityRow>(
  rows: readonly T[],
  executor: DbExecutor = db,
): Promise<Array<T & { debt: number; totalEquity: number; equity: number }>> {
  const ids = rows.flatMap((row) => (row.mortgageId === null ? [] : [row.mortgageId]));
  const linked =
    ids.length === 0
      ? []
      : await executor
          .select({
            id: mortgages.id,
            outstandingBalance: mortgages.outstandingBalance,
            isJoint: mortgages.isJoint,
          })
          .from(mortgages)
          .where(and(inArray(mortgages.id, ids), isNull(mortgages.archivedAt)));
  const debts = new Map<number, PropertyDebtSource>(
    linked.map((row) => [
      row.id,
      { outstandingBalance: toNumberOrZero(row.outstandingBalance), isJoint: row.isJoint },
    ]),
  );
  return rows.map((row) => {
    const debt = row.mortgageId === null ? null : (debts.get(row.mortgageId) ?? null);
    const currentValue = toNumberOrZero(row.currentValue);
    const debtBalance = debt?.outstandingBalance ?? 0;
    return {
      ...row,
      debt: debtBalance,
      totalEquity: roundMoney(currentValue - debtBalance),
      equity: roundMoney(propertyEquity({ currentValue, isJoint: row.isJoint }, debt)),
    };
  });
}
