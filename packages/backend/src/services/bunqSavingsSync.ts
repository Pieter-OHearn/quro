import { and, eq } from 'drizzle-orm';
import { isCurrencyCode, type CurrencyCode } from '@quro/shared';
import { db } from '../db/client';
import { bunqConnections, savingsAccounts, savingsTransactions } from '../db/schema';
import {
  createInstallation,
  createSession,
  fetchMonetaryAccounts,
  fetchPayments,
  generateKeyPair,
  registerDevice,
  type BunqMonetaryAccount,
  type BunqPayment,
  type BunqSessionResult,
} from '../lib/bunqClient';
import { toBunqNewerThanCursor } from '../lib/bunqSyncCursor';

const DEFAULT_BUNQ_COLOR = '#3b82f6';
const DEFAULT_BUNQ_EMOJI = '🏦';

type BunqConnectionRow = typeof bunqConnections.$inferSelect;
type SavingsAccountRow = typeof savingsAccounts.$inferSelect;
export type BunqSavingsSyncIssue = {
  accountId?: number;
  paymentId?: string;
  message: string;
};
export type BunqSavingsSyncResult = {
  status: 'skipped' | 'success' | 'partial';
  syncedAt: Date | null;
  issues: BunqSavingsSyncIssue[];
};

async function loadConnection(userId: number): Promise<BunqConnectionRow | null> {
  const [connection] = await db
    .select()
    .from(bunqConnections)
    .where(eq(bunqConnections.userId, userId));
  return connection ?? null;
}

function isSessionValid(connection: BunqConnectionRow): boolean {
  if (!connection.sessionToken || !connection.sessionExpiresAt) return false;
  return connection.sessionExpiresAt.getTime() > Date.now();
}

async function bootstrapApiContext(connection: BunqConnectionRow): Promise<{
  installationToken: string;
  privateKey: string;
}> {
  if (connection.installationToken && connection.privateKey) {
    return {
      installationToken: connection.installationToken,
      privateKey: connection.privateKey,
    };
  }

  const keyPair = generateKeyPair();
  const installation = await createInstallation(keyPair.publicKey);

  await db
    .update(bunqConnections)
    .set({
      privateKey: keyPair.privateKey,
      installationToken: installation.installationToken,
      serverPublicKey: installation.serverPublicKey,
    })
    .where(eq(bunqConnections.id, connection.id));

  await registerDevice(installation.installationToken, connection.accessToken, keyPair.privateKey);

  return {
    installationToken: installation.installationToken,
    privateKey: keyPair.privateKey,
  };
}

async function ensureSession(connection: BunqConnectionRow): Promise<BunqSessionResult> {
  if (isSessionValid(connection) && connection.bunqUserId) {
    return {
      sessionToken: connection.sessionToken!,
      sessionId: connection.sessionId,
      bunqUserId: connection.bunqUserId,
      expiresAt: connection.sessionExpiresAt!,
    };
  }

  const { installationToken, privateKey } = await bootstrapApiContext(connection);
  const session = await createSession(installationToken, connection.accessToken, privateKey);

  await db
    .update(bunqConnections)
    .set({
      sessionToken: session.sessionToken,
      sessionId: session.sessionId,
      sessionExpiresAt: session.expiresAt,
      bunqUserId: session.bunqUserId,
    })
    .where(eq(bunqConnections.id, connection.id));

  return session;
}

async function findLocalSavingsAccount(
  userId: number,
  bunqAccountId: string,
): Promise<SavingsAccountRow | null> {
  const [account] = await db
    .select()
    .from(savingsAccounts)
    .where(
      and(eq(savingsAccounts.userId, userId), eq(savingsAccounts.bunqAccountId, bunqAccountId)),
    );
  return account ?? null;
}

async function createLocalSavingsAccount(
  userId: number,
  account: BunqMonetaryAccount,
  currency: CurrencyCode,
): Promise<SavingsAccountRow> {
  const [inserted] = await db
    .insert(savingsAccounts)
    .values({
      userId,
      name: account.description || 'Bunq Savings',
      bank: 'Bunq',
      balance: Number(account.balance.value),
      currency,
      interestRate: 0,
      accountType: 'Easy Access',
      color: DEFAULT_BUNQ_COLOR,
      emoji: DEFAULT_BUNQ_EMOJI,
      bunqAccountId: String(account.id),
    })
    .returning();
  return inserted;
}

async function updateLocalSavingsAccount(
  localId: number,
  userId: number,
  account: BunqMonetaryAccount,
): Promise<void> {
  await db
    .update(savingsAccounts)
    .set({
      balance: Number(account.balance.value),
    })
    .where(and(eq(savingsAccounts.id, localId), eq(savingsAccounts.userId, userId)));
}

async function upsertSavingsAccount(
  userId: number,
  account: BunqMonetaryAccount,
): Promise<SavingsAccountRow | null> {
  if (!isCurrencyCode(account.balance.currency)) return null;
  const bunqAccountId = String(account.id);
  const existing = await findLocalSavingsAccount(userId, bunqAccountId);
  if (existing) {
    await updateLocalSavingsAccount(existing.id, userId, account);
    return existing;
  }
  return createLocalSavingsAccount(userId, account, account.balance.currency);
}

function classifyPayment(amountValue: string): 'deposit' | 'withdrawal' {
  return amountValue.trim().startsWith('-') ? 'withdrawal' : 'deposit';
}

function toTransactionDate(created: string): string {
  const trimmed = created.trim();
  if (!trimmed) return new Date().toISOString().slice(0, 10);
  return trimmed.slice(0, 10);
}

async function importPayment(
  userId: number,
  localAccountId: number,
  payment: BunqPayment,
): Promise<void> {
  const bunqTransactionId = String(payment.id);
  const type = classifyPayment(payment.amount.value);
  const absoluteAmount = Math.abs(Number(payment.amount.value) || 0);
  if (absoluteAmount <= 0) return;

  await db
    .insert(savingsTransactions)
    .values({
      userId,
      accountId: localAccountId,
      type,
      amount: absoluteAmount,
      date: toTransactionDate(payment.created),
      note: payment.description || null,
      bunqTransactionId,
    })
    .onConflictDoNothing({
      target: [savingsTransactions.userId, savingsTransactions.bunqTransactionId],
    });
}

async function syncAccountPayments(
  sessionToken: string,
  bunqUserId: string,
  userId: number,
  localAccountId: number,
  bunqAccountId: number,
  newerThan: string | undefined,
): Promise<BunqSavingsSyncIssue[]> {
  const payments = await fetchPayments(sessionToken, bunqUserId, bunqAccountId, newerThan);
  const issues: BunqSavingsSyncIssue[] = [];
  for (const payment of payments) {
    try {
      await importPayment(userId, localAccountId, payment);
    } catch (error) {
      issues.push({
        accountId: bunqAccountId,
        paymentId: String(payment.id),
        message: error instanceof Error ? error.message : 'Savings payment import failed',
      });
    }
  }
  return issues;
}

async function markSyncing(connectionId: number): Promise<void> {
  await db
    .update(bunqConnections)
    .set({ syncStatus: 'syncing', syncError: null })
    .where(eq(bunqConnections.id, connectionId));
}

async function markSyncSucceeded(
  connectionId: number,
  bunqUserId: string,
  syncedAt: Date,
  updateCursor: boolean,
): Promise<void> {
  await db
    .update(bunqConnections)
    .set({
      syncStatus: 'idle',
      syncError: null,
      ...(updateCursor ? { lastSyncAt: syncedAt } : {}),
      bunqUserId,
    })
    .where(eq(bunqConnections.id, connectionId));
}

async function markSyncFailed(connectionId: number, message: string): Promise<void> {
  await db
    .update(bunqConnections)
    .set({ syncStatus: 'error', syncError: message })
    .where(eq(bunqConnections.id, connectionId));
}

async function detachOrphanedBunqSavingsAccounts(
  userId: number,
  activeBunqAccountIds: ReadonlySet<string>,
): Promise<void> {
  const accounts = await db
    .select({ id: savingsAccounts.id, bunqAccountId: savingsAccounts.bunqAccountId })
    .from(savingsAccounts)
    .where(eq(savingsAccounts.userId, userId));

  for (const account of accounts) {
    if (!account.bunqAccountId || activeBunqAccountIds.has(account.bunqAccountId)) continue;
    await db
      .update(savingsAccounts)
      .set({ bunqAccountId: null })
      .where(and(eq(savingsAccounts.id, account.id), eq(savingsAccounts.userId, userId)));
  }
}

export async function syncBunqSavings(
  userId: number,
  newerThanOverride?: string,
  skipCursorUpdate = false,
): Promise<BunqSavingsSyncResult> {
  const connection = await loadConnection(userId);
  if (!connection) return { status: 'skipped', syncedAt: null, issues: [] };

  await markSyncing(connection.id);
  const issues: BunqSavingsSyncIssue[] = [];

  try {
    const session = await ensureSession(connection);
    const accounts = await fetchMonetaryAccounts(session.sessionToken, session.bunqUserId);
    const savingsOnly = accounts.filter((a) => a.type === 'SAVINGS');
    const activeBunqAccountIds = new Set(savingsOnly.map((a) => String(a.id)));
    const newerThan = newerThanOverride ?? toBunqNewerThanCursor(connection.lastSyncAt);

    for (const bunqAccount of savingsOnly) {
      const localAccount = await upsertSavingsAccount(userId, bunqAccount);
      if (!localAccount) continue;
      issues.push(
        ...(await syncAccountPayments(
          session.sessionToken,
          session.bunqUserId,
          userId,
          localAccount.id,
          bunqAccount.id,
          newerThan,
        )),
      );
    }
    await detachOrphanedBunqSavingsAccounts(userId, activeBunqAccountIds);

    const syncedAt = new Date();
    await (issues.length > 0
      ? markSyncFailed(connection.id, `${issues.length} Bunq savings payment(s) failed to import`)
      : markSyncSucceeded(connection.id, session.bunqUserId, syncedAt, !skipCursorUpdate));
    return { status: issues.length > 0 ? 'partial' : 'success', syncedAt, issues };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await markSyncFailed(connection.id, message);
    throw error;
  }
}
