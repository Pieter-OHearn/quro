import { roundMoney } from '@quro/shared';
import { and, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../db/client';
// Shared balance-reconciliation helpers used by mortgage and property
// repayment transactions. Mirrors the debt-payment pattern: a repayment's
// principal portion reduces an outstanding balance when recorded and is
// restored if the transaction is later removed or edited.

// Reduce an outstanding balance by a repayment's principal, clamped at zero.
export function applyPrincipalToBalance(currentBalance: number, principal: number): number {
  return Math.max(0, roundMoney(currentBalance - principal));
}

// Restore principal to an outstanding balance (the inverse of applying it).
export function restorePrincipalToBalance(currentBalance: number, principal: number): number {
  return roundMoney(currentBalance + principal);
}

export function validatePrincipalAgainstBalance(
  principal: number,
  currentBalance: number,
): string | null {
  if (principal > roundMoney(currentBalance) + 0.01) {
    return 'Principal portion cannot exceed the current outstanding balance';
  }
  return null;
}

type RepaymentTarget = {
  table: PgTable;
  idColumn: PgColumn;
  balanceColumn: PgColumn;
  id: number;
  principal: number;
  // Extra predicate (e.g. ownership) ANDed with the id match.
  where?: SQL;
};

function balanceKey(table: PgTable, balanceColumn: PgColumn): string {
  const entry = Object.entries(getTableColumns(table)).find(
    ([, column]) => column === balanceColumn,
  );
  if (!entry) throw new Error(`Column ${balanceColumn.name} does not belong to the given table`);
  return entry[0];
}

// Atomically reduce a row's balance by a repayment's principal (clamped at
// zero). The ±0.01 guard lives in the UPDATE's WHERE clause so concurrent
// repayments cannot overdraw the balance. Returns the new balance, or null
// when the row is missing or the principal exceeds the current balance.
export async function applyRepayment(
  tx: DbExecutor,
  { table, idColumn, balanceColumn, id, principal, where }: Readonly<RepaymentTarget>,
): Promise<number | null> {
  const [updated] = await tx
    .update(table)
    .set({
      [balanceKey(table, balanceColumn)]:
        sql`GREATEST(0, CAST(${balanceColumn} AS numeric) - ${principal})`,
    } as never)
    .where(
      and(eq(idColumn, id), where, sql`CAST(${balanceColumn} AS numeric) + 0.01 >= ${principal}`),
    )
    .returning({ balance: balanceColumn });
  return updated ? Number(updated.balance) : null;
}

// Inverse of applyRepayment: restore principal to the row's balance. Returns
// the new balance, or null when the row is missing.
export async function reverseRepayment(
  tx: DbExecutor,
  { table, idColumn, balanceColumn, id, principal, where }: Readonly<RepaymentTarget>,
): Promise<number | null> {
  const [updated] = await tx
    .update(table)
    .set({
      [balanceKey(table, balanceColumn)]: sql`CAST(${balanceColumn} AS numeric) + ${principal}`,
    } as never)
    .where(and(eq(idColumn, id), where))
    .returning({ balance: balanceColumn });
  return updated ? Number(updated.balance) : null;
}
