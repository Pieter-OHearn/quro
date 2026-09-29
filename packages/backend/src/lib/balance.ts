import { roundMoney } from '@quro/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../db/client';
import { debts, mortgages, properties } from '../db/schema';

// Rounding slack allowed when a principal is checked against a balance.
const BALANCE_TOLERANCE = 0.01;

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
  if (principal > roundMoney(currentBalance) + BALANCE_TOLERANCE) {
    return 'Principal portion cannot exceed the current outstanding balance';
  }
  return null;
}

// Identifies the outstanding-balance column a repayment moves. `balanceKey`
// is the schema property name (what `.set()` takes), checked against the table
// by `defineRepaymentTarget`.
type RepaymentTarget = {
  table: PgTable;
  idColumn: PgColumn;
  balanceColumn: PgColumn;
  balanceKey: string;
};

function defineRepaymentTarget<T extends PgTable>(target: {
  table: T;
  idColumn: PgColumn;
  balanceColumn: PgColumn;
  balanceKey: keyof T['$inferInsert'] & string;
}): RepaymentTarget {
  return target;
}

export const DEBT_BALANCE = defineRepaymentTarget({
  table: debts,
  idColumn: debts.id,
  balanceColumn: debts.remainingBalance,
  balanceKey: 'remainingBalance',
});

export const MORTGAGE_BALANCE = defineRepaymentTarget({
  table: mortgages,
  idColumn: mortgages.id,
  balanceColumn: mortgages.outstandingBalance,
  balanceKey: 'outstandingBalance',
});

export const PROPERTY_MORTGAGE_BALANCE = defineRepaymentTarget({
  table: properties,
  idColumn: properties.id,
  balanceColumn: properties.mortgage,
  balanceKey: 'mortgage',
});

type RepaymentChange = {
  id: number;
  principal: number;
  // Extra predicate (e.g. ownership) ANDed with the id match.
  where?: SQL;
};

function balanceUpdate(target: RepaymentTarget, expression: SQL): PgUpdateSetSource<PgTable> {
  return { [target.balanceKey]: expression } as PgUpdateSetSource<PgTable>;
}

// Atomically reduce a row's balance by a repayment's principal (clamped at
// zero). The tolerance guard lives in the UPDATE's WHERE clause so concurrent
// repayments cannot overdraw the balance. Returns the new balance, or null
// when the row is missing or the principal exceeds the current balance.
export async function applyRepayment(
  tx: DbExecutor,
  target: RepaymentTarget,
  { id, principal, where }: Readonly<RepaymentChange>,
): Promise<number | null> {
  const { table, idColumn, balanceColumn } = target;
  const [updated] = await tx
    .update(table)
    .set(balanceUpdate(target, sql`GREATEST(0, CAST(${balanceColumn} AS numeric) - ${principal})`))
    .where(
      and(
        eq(idColumn, id),
        where,
        sql`CAST(${balanceColumn} AS numeric) + ${BALANCE_TOLERANCE} >= ${principal}`,
      ),
    )
    .returning({ balance: balanceColumn });
  return updated ? Number(updated.balance) : null;
}

// Inverse of applyRepayment: restore principal to the row's balance. Returns
// the new balance, or null when the row is missing.
export async function reverseRepayment(
  tx: DbExecutor,
  target: RepaymentTarget,
  { id, principal, where }: Readonly<RepaymentChange>,
): Promise<number | null> {
  const { table, idColumn, balanceColumn } = target;
  const [updated] = await tx
    .update(table)
    .set(balanceUpdate(target, sql`CAST(${balanceColumn} AS numeric) + ${principal}`))
    .where(and(eq(idColumn, id), where))
    .returning({ balance: balanceColumn });
  return updated ? Number(updated.balance) : null;
}
