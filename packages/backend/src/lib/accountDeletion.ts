import { and, eq, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db, type DbExecutor } from '../db/client';
import {
  accountDeletions,
  authCodes,
  bunqConnections,
  bunqOauthAttempts,
  oidcIdentities,
  bunqPaymentProgress,
  mortgageTransactions,
  mortgages,
  partnerLinks,
  propertyTransactions,
  properties,
  savingsAccounts,
  savingsTransactions,
  sessions,
  users,
} from '../db/schema';
import { ACCOUNT_TABLES, countAccountRows, documentOfRow, selectAccountRows } from './accountData';
import { getDocumentStore } from './documentStorage';
import { isValidDocumentKey, type DocumentStore } from './documentStore';

// Account deletion: everything the account owns goes in one transaction, together with a row in
// `account_deletions` that records what was removed (counts, no personal data). Stored documents
// are removed after the commit; the keys the store refused are kept on the audit row so an
// operator can retry them (`quro documents retry-deleted`). Backups are not touched: a backup
// taken before the deletion keeps the account until it is deleted or expires.

export type AccountDeletionPreview = {
  /** Rows that go with the account, per table (only tables that hold rows). */
  rowCounts: Record<string, number>;
  /** Joint accounts, properties and mortgages the partner can see today. */
  sharedWithPartner: number;
  documentCount: number;
  hasPartner: boolean;
};

export type AccountDeletionResult = {
  auditId: number;
  documentCount: number;
  documentsDeleted: number;
  documentsPending: number;
};

export async function previewAccountDeletion(userId: number): Promise<AccountDeletionPreview> {
  const rowCounts: Record<string, number> = {};
  let documentCount = 0;
  for (const entry of ACCOUNT_TABLES) {
    const count = await countAccountRows(db, entry, userId);
    if (count > 0 && entry.name !== 'users') rowCounts[entry.name] = count;
    if (entry.document && count > 0) {
      const rows = await selectAccountRows(db, entry, userId);
      documentCount += rows.filter((row) => documentOfRow(entry, row)).length;
    }
  }
  const joint = async (table: typeof savingsAccounts | typeof properties | typeof mortgages) => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.isJoint, true)));
    return row?.count ?? 0;
  };
  const [partner] = await db
    .select({ id: partnerLinks.id })
    .from(partnerLinks)
    .where(
      and(
        eq(partnerLinks.status, 'accepted'),
        or(eq(partnerLinks.requesterId, userId), eq(partnerLinks.addresseeId, userId)),
      ),
    )
    .limit(1);
  return {
    rowCounts,
    sharedWithPartner:
      (await joint(savingsAccounts)) + (await joint(properties)) + (await joint(mortgages)),
    documentCount,
    hasPartner: Boolean(partner),
  };
}

/**
 * Rows the account entered on its partner's joint accounts are part of the partner's ledger and
 * their balances. They move to the account's owner instead of disappearing from the partner's
 * history.
 */
async function handOverEnteredRows(tx: DbExecutor, userId: number) {
  const handOver = async (
    child: typeof savingsTransactions | typeof propertyTransactions | typeof mortgageTransactions,
    parent: typeof savingsAccounts | typeof properties | typeof mortgages,
    foreignKey: AnyPgColumn,
  ) => {
    await tx.execute(sql`
      update ${child} set user_id = ${parent.userId}
      from ${parent}
      where ${foreignKey} = ${parent.id}
        and ${child.userId} = ${userId}
        and ${parent.userId} <> ${userId}`);
  };
  await handOver(savingsTransactions, savingsAccounts, savingsTransactions.accountId);
  await handOver(propertyTransactions, properties, propertyTransactions.propertyId);
  await handOver(mortgageTransactions, mortgages, mortgageTransactions.mortgageId);
}

/** Removes the account's rows, children first, and returns the counts and document keys. */
async function removeOwnedRows(tx: DbExecutor, userId: number) {
  const counts: Record<string, number> = {};
  const documentKeys = new Set<string>();
  for (const entry of [...ACCOUNT_TABLES].reverse()) {
    if (entry.name === 'users') continue;
    const removed = (await tx.delete(entry.table).where(entry.scope(userId)).returning()) as Record<
      string,
      unknown
    >[];
    if (removed.length > 0) counts[entry.name] = removed.length;
    for (const row of removed) {
      const key = documentOfRow(entry, row)?.key;
      if (key !== undefined && isValidDocumentKey(key)) documentKeys.add(key);
    }
  }
  return { counts, documentKeys };
}

/** Deletes the account and all it owns. Resolves after the documents were asked to go. */
export async function deleteAccount(
  userId: number,
  store: DocumentStore = getDocumentStore(),
): Promise<AccountDeletionResult> {
  const { auditId, keys } = await db.transaction(async (tx) => {
    await handOverEnteredRows(tx, userId);

    const { counts, documentKeys } = await removeOwnedRows(tx, userId);

    // Bank links, sign-in state and partner links: housekeeping that has no export.
    const bunq = await tx
      .delete(bunqConnections)
      .where(eq(bunqConnections.userId, userId))
      .returning({ id: bunqConnections.id });
    await tx.delete(bunqOauthAttempts).where(eq(bunqOauthAttempts.userId, userId));
    await tx.delete(bunqPaymentProgress).where(eq(bunqPaymentProgress.userId, userId));
    if (bunq.length > 0) counts.bunq_connections = bunq.length;
    const closedSessions = await tx
      .delete(sessions)
      .where(eq(sessions.userId, userId))
      .returning({ id: sessions.id });
    counts.sessions = closedSessions.length;
    await tx.delete(oidcIdentities).where(eq(oidcIdentities.userId, userId));
    await tx.delete(authCodes).where(eq(authCodes.userId, userId));
    await tx
      .delete(partnerLinks)
      .where(
        sql`${partnerLinks.requesterId} = ${userId} or ${partnerLinks.addresseeId} = ${userId}`,
      );
    await tx.delete(users).where(eq(users.id, userId));
    counts.users = 1;

    const [audit] = await tx
      .insert(accountDeletions)
      .values({
        deletedUserId: userId,
        rowCounts: counts,
        documentCount: documentKeys.size,
      })
      .returning({ id: accountDeletions.id });
    return { auditId: audit!.id, keys: [...documentKeys] };
  });

  const outcome = await removeDocuments(store, keys);
  await db
    .update(accountDeletions)
    .set({
      documentsDeleted: outcome.deleted,
      documentsFailedKeys: outcome.failedKeys,
      documentsCheckedAt: new Date(),
    })
    .where(eq(accountDeletions.id, auditId));
  return {
    auditId,
    documentCount: keys.length,
    documentsDeleted: outcome.deleted,
    documentsPending: outcome.failedKeys.length,
  };
}

async function removeDocuments(store: DocumentStore, keys: string[]) {
  if (keys.length === 0) return { deleted: 0, failedKeys: [] as string[] };
  try {
    const result = await store.deleteMany(keys);
    return { deleted: result.deletedKeys.length, failedKeys: result.failedKeys };
  } catch {
    // The store itself is unreachable: every key stays on the audit row for a retry.
    return { deleted: 0, failedKeys: keys };
  }
}

export type DocumentRetryReport = { deletions: number; deleted: number; stillFailing: number };

/** Retries the documents earlier deletions could not remove. */
export async function retryDeletedAccountDocuments(
  store: DocumentStore = getDocumentStore(),
): Promise<DocumentRetryReport> {
  const pending = (await db
    .select()
    .from(accountDeletions)
    .where(
      sql`jsonb_array_length(coalesce(${accountDeletions.documentsFailedKeys}, '[]'::jsonb)) > 0`,
    )) as Array<typeof accountDeletions.$inferSelect>;
  const report: DocumentRetryReport = { deletions: pending.length, deleted: 0, stillFailing: 0 };
  for (const row of pending) {
    const keys = (row.documentsFailedKeys ?? []).filter(isValidDocumentKey);
    const outcome = await removeDocuments(store, keys);
    report.deleted += outcome.deleted;
    report.stillFailing += outcome.failedKeys.length;
    await db
      .update(accountDeletions)
      .set({
        documentsDeleted: (row.documentsDeleted ?? 0) + outcome.deleted,
        documentsFailedKeys: outcome.failedKeys,
        documentsCheckedAt: new Date(),
      })
      .where(eq(accountDeletions.id, row.id));
  }
  return report;
}
