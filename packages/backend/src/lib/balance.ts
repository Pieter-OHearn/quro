import { fromCents, toCents } from '@quro/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../db/client';
import { debts, mortgages } from '../db/schema';

// Rounding slack allowed when a repayment's principal is checked against a balance.
const BALANCE_TOLERANCE_CENTS = 1;

// Shared balance-reconciliation helpers used by mortgage repayments and debt
// payments: a repayment's principal portion reduces an outstanding balance
// when recorded and is restored if the transaction is later removed or edited.

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

type RepaymentChange = {
  id: number;
  principal: number;
  // Extra predicate (e.g. ownership) ANDed with the id match.
  where?: SQL;
};

type RepaymentReversal = RepaymentChange & {
  // The part of the principal the zero clamp absorbed when the repayment was applied.
  unapplied?: number;
};

export type AppliedRepayment = {
  balance: number;
  // The part of the principal the balance could not take because it reached zero. Stored with
  // the repayment so that reversing it restores exactly what it reduced.
  unapplied: number;
};

function balanceUpdate(target: RepaymentTarget, expression: SQL): PgUpdateSetSource<PgTable> {
  return { [target.balanceKey]: expression } as PgUpdateSetSource<PgTable>;
}

// Reduce a row's balance by a repayment's principal, clamped at zero. The row is locked before
// its balance is read, so concurrent repayments cannot overdraw it. Returns the new balance and
// the principal the clamp absorbed, or null when the row is missing or the principal exceeds the
// balance by more than the one-cent tolerance.
export async function applyRepayment(
  tx: DbExecutor,
  target: RepaymentTarget,
  { id, principal, where }: Readonly<RepaymentChange>,
): Promise<AppliedRepayment | null> {
  const { table, idColumn, balanceColumn } = target;
  const [row] = await tx
    .select({ balance: balanceColumn })
    .from(table)
    .where(and(eq(idColumn, id), where))
    .for('no key update');
  if (!row) return null;

  const balanceCents = toCents(Number(row.balance));
  const principalCents = toCents(principal);
  if (principalCents > balanceCents + BALANCE_TOLERANCE_CENTS) return null;
  const nextCents = Math.max(0, balanceCents - principalCents);
  const unappliedCents = principalCents - (balanceCents - nextCents);

  await tx
    .update(table)
    .set(balanceUpdate(target, sql`${fromCents(nextCents)}::numeric`))
    .where(eq(idColumn, id));
  return { balance: fromCents(nextCents), unapplied: fromCents(unappliedCents) };
}

// Inverse of applyRepayment: restore the principal the repayment applied (its principal minus
// what the clamp absorbed). Returns the new balance, or null when the row is missing.
export async function reverseRepayment(
  tx: DbExecutor,
  target: RepaymentTarget,
  { id, principal, unapplied = 0, where }: Readonly<RepaymentReversal>,
): Promise<number | null> {
  const { table, idColumn, balanceColumn } = target;
  const applied = fromCents(toCents(principal) - toCents(unapplied));
  const [updated] = await tx
    .update(table)
    .set(balanceUpdate(target, sql`CAST(${balanceColumn} AS numeric) + ${applied}`))
    .where(and(eq(idColumn, id), where))
    .returning({ balance: balanceColumn });
  return updated ? Number(updated.balance) : null;
}
