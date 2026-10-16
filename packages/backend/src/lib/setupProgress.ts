import type { SetupProgress } from '@quro/shared';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import {
  budgetTransactions,
  debtPayments,
  debts,
  holdingTransactions,
  holdings,
  mortgageTransactions,
  mortgages,
  payslips,
  pensionPots,
  pensionTransactions,
  properties,
  propertyTransactions,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { ownedOrJointPredicate } from './partner';

// First-run guidance asks two questions of the household: has it recorded an account, and has
// it recorded a transaction? Both follow the household rule: the user's own rows plus an
// accepted partner's joint savings accounts, properties and mortgages, with their transactions.
// Archived rows count: an archived account still means the household has been set up.

type Probe = { table: PgTable; where: SQL; join?: { table: PgTable; on: SQL } };

async function anyRow(probe: Probe): Promise<boolean> {
  const query = db
    .select({ found: sql<number>`1` })
    .from(probe.table)
    .$dynamic();
  const scoped = probe.join ? query.innerJoin(probe.join.table, probe.join.on) : query;
  const rows = await scoped.where(probe.where).limit(1);
  return rows.length > 0;
}

// One indexed lookup at a time, stopping at the first hit, so a household that is set up costs
// one or two queries and the check never holds more than one pooled connection.
async function anyOf(probes: readonly Probe[]): Promise<boolean> {
  for (const probe of probes) {
    if (await anyRow(probe)) return true;
  }
  return false;
}

function owned(table: PgTable & { userId: PgColumn }, userId: number): Probe {
  return { table, where: eq(table.userId, userId) };
}

export async function loadSetupProgress(
  userId: number,
  partnerId: number | null,
): Promise<SetupProgress> {
  const savingsAccess = ownedOrJointPredicate(savingsAccounts, userId, partnerId);
  const propertyAccess = ownedOrJointPredicate(properties, userId, partnerId);
  const mortgageAccess = ownedOrJointPredicate(mortgages, userId, partnerId);

  const hasAccount = await anyOf([
    { table: savingsAccounts, where: savingsAccess },
    { table: properties, where: propertyAccess },
    { table: mortgages, where: mortgageAccess },
    owned(holdings, userId),
    owned(pensionPots, userId),
    owned(debts, userId),
  ]);
  const hasTransaction = await anyOf([
    {
      table: savingsTransactions,
      where: savingsAccess,
      join: { table: savingsAccounts, on: eq(savingsTransactions.accountId, savingsAccounts.id) },
    },
    {
      table: propertyTransactions,
      where: propertyAccess,
      join: { table: properties, on: eq(propertyTransactions.propertyId, properties.id) },
    },
    {
      table: mortgageTransactions,
      where: mortgageAccess,
      join: { table: mortgages, on: eq(mortgageTransactions.mortgageId, mortgages.id) },
    },
    owned(holdingTransactions, userId),
    owned(pensionTransactions, userId),
    owned(debtPayments, userId),
    owned(payslips, userId),
    owned(budgetTransactions, userId),
  ]);

  return { hasAccount, hasTransaction };
}
