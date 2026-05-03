import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  budgetCategories,
  budgetTransactions,
  bunqConnections,
  categoryMappings,
} from '../db/schema';
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
import {
  CATEGORY_PRESETS,
  DEFAULT_CATEGORY_PRESET,
  MCC_DEFAULTS,
  UNCATEGORISED_NAME,
} from './bunqCategoryRules';

const BUDGET_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MCC_SOURCE = 'mcc';

type BunqConnectionRow = typeof bunqConnections.$inferSelect;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BudgetCategoryTemplate = {
  budgeted: string;
  emoji: string | null;
  color: string | null;
};
export type BunqSyncIssue = {
  accountId?: number;
  paymentId?: string;
  message: string;
};
export type BunqSyncResult = {
  status: 'skipped' | 'success' | 'partial';
  syncedAt: Date | null;
  issues: BunqSyncIssue[];
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

async function bootstrapApiContext(
  connection: BunqConnectionRow,
): Promise<{ installationToken: string; privateKey: string }> {
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

function isDebit(payment: BunqPayment): boolean {
  return payment.amount.value.trim().startsWith('-');
}

function isSelfTransfer(
  payment: BunqPayment,
  ownIbans: ReadonlySet<string>,
  bunqUserId: string,
): boolean {
  const counterIban = payment.counterpartyAlias.iban;
  if (counterIban !== null && ownIbans.has(counterIban)) return true;
  const counterBunqId = payment.counterpartyAlias.bunqUserId;
  return counterBunqId !== null && String(counterBunqId) === bunqUserId;
}

function toTransactionDate(created: string): string {
  const trimmed = created.trim();
  if (!trimmed) return new Date().toISOString().slice(0, 10);
  return trimmed.slice(0, 10);
}

function parseMonthYear(dateStr: string): { month: string; year: number } {
  const [yearStr, monthStr] = dateStr.split('-');
  const monthIndex = parseInt(monthStr, 10) - 1;
  if (Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex >= BUDGET_MONTHS.length) {
    throw new Error(`Invalid Bunq payment date: ${dateStr}`);
  }
  const year = parseInt(yearStr, 10);
  if (Number.isNaN(year)) {
    throw new Error(`Invalid Bunq payment date: ${dateStr}`);
  }
  return { month: BUDGET_MONTHS[monthIndex], year };
}

const budgetCategoryMonthIndex = sql<number>`case ${budgetCategories.month}
  when 'Jan' then 0
  when 'Feb' then 1
  when 'Mar' then 2
  when 'Apr' then 3
  when 'May' then 4
  when 'Jun' then 5
  when 'Jul' then 6
  when 'Aug' then 7
  when 'Sep' then 8
  when 'Oct' then 9
  when 'Nov' then 10
  when 'Dec' then 11
  else -1
end`;

async function findLatestCategoryTemplate(
  tx: DbTransaction,
  userId: number,
  name: string,
): Promise<BudgetCategoryTemplate | null> {
  const [template] = await tx
    .select({
      budgeted: budgetCategories.budgeted,
      emoji: budgetCategories.emoji,
      color: budgetCategories.color,
    })
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.userId, userId),
        eq(budgetCategories.name, name),
        gt(budgetCategories.budgeted, '0'),
      ),
    )
    .orderBy(desc(budgetCategories.year), desc(budgetCategoryMonthIndex), desc(budgetCategories.id))
    .limit(1);

  return template ?? null;
}

export async function findOrCreateCategoryByName(
  tx: DbTransaction,
  userId: number,
  name: string,
  month: string,
  year: number,
): Promise<number> {
  const [existing] = await tx
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.userId, userId),
        eq(budgetCategories.name, name),
        eq(budgetCategories.month, month),
        eq(budgetCategories.year, year),
      ),
    );

  if (existing) return existing.id;

  const preset = CATEGORY_PRESETS[name] ?? DEFAULT_CATEGORY_PRESET;
  const template = await findLatestCategoryTemplate(tx, userId, name);
  const [inserted] = await tx
    .insert(budgetCategories)
    .values({
      userId,
      name,
      emoji: template?.emoji ?? preset.emoji,
      budgeted: template?.budgeted ?? '0',
      spent: '0',
      color: template?.color ?? preset.color,
      month,
      year,
    })
    .onConflictDoUpdate({
      target: [
        budgetCategories.userId,
        budgetCategories.month,
        budgetCategories.year,
        budgetCategories.name,
      ],
      set: { name },
    })
    .returning({ id: budgetCategories.id });

  return inserted.id;
}

async function findMccMappingName(userId: number, mcc: string): Promise<string | null> {
  const [mapping] = await db
    .select({ categoryName: categoryMappings.categoryName })
    .from(categoryMappings)
    .where(
      and(
        eq(categoryMappings.userId, userId),
        eq(categoryMappings.source, MCC_SOURCE),
        eq(categoryMappings.sourceKey, mcc),
      ),
    );
  return mapping?.categoryName ?? null;
}

async function recordMccMapping(userId: number, mcc: string, name: string): Promise<void> {
  await db
    .insert(categoryMappings)
    .values({ userId, source: MCC_SOURCE, sourceKey: mcc, categoryName: name })
    .onConflictDoNothing();
}

async function resolveCategoryName(userId: number, payment: BunqPayment): Promise<string> {
  const mcc = payment.counterpartyAlias.merchantCategoryCode;
  if (!mcc) return UNCATEGORISED_NAME;

  const mapped = await findMccMappingName(userId, mcc);
  if (mapped) return mapped;

  const seeded = MCC_DEFAULTS[mcc];
  if (seeded) {
    await recordMccMapping(userId, mcc, seeded);
    return seeded;
  }

  return UNCATEGORISED_NAME;
}

async function claimMatchingManualBudgetTransaction(
  tx: DbTransaction,
  userId: number,
  payment: BunqPayment,
  amount: number,
  dateStr: string,
  bunqTransactionId: string,
): Promise<boolean> {
  const [manualMatch] = await tx
    .select({ id: budgetTransactions.id })
    .from(budgetTransactions)
    .where(
      and(
        eq(budgetTransactions.userId, userId),
        isNull(budgetTransactions.bunqTransactionId),
        eq(budgetTransactions.amount, amount.toString()),
        eq(budgetTransactions.date, dateStr),
        eq(budgetTransactions.merchant, payment.counterpartyAlias.displayName || ''),
        eq(budgetTransactions.description, payment.description || ''),
      ),
    )
    .orderBy(asc(budgetTransactions.id))
    .limit(1);

  if (!manualMatch) return false;

  const claimed = await tx
    .update(budgetTransactions)
    .set({
      bunqTransactionId,
      bunqMcc: payment.counterpartyAlias.merchantCategoryCode,
      bunqPaymentType: payment.type || null,
      counterpartyIban: payment.counterpartyAlias.iban,
    })
    .where(
      and(
        eq(budgetTransactions.id, manualMatch.id),
        eq(budgetTransactions.userId, userId),
        isNull(budgetTransactions.bunqTransactionId),
      ),
    )
    .returning({ id: budgetTransactions.id });

  return claimed.length > 0;
}

async function importBudgetPayment(
  userId: number,
  payment: BunqPayment,
  ownIbans: ReadonlySet<string>,
  bunqUserId: string,
  accountCurrency: string,
): Promise<void> {
  if (!isDebit(payment)) return;
  if (isSelfTransfer(payment, ownIbans, bunqUserId)) return;
  if (payment.amount.currency !== accountCurrency) return;

  const dateStr = toTransactionDate(payment.created);
  const { month, year } = parseMonthYear(dateStr);
  const amount = Math.abs(Number(payment.amount.value) || 0);
  if (amount <= 0) return;
  const bunqTransactionId = String(payment.id);

  const categoryName = await resolveCategoryName(userId, payment);
  await db.transaction(async (tx) => {
    const claimedManual = await claimMatchingManualBudgetTransaction(
      tx,
      userId,
      payment,
      amount,
      dateStr,
      bunqTransactionId,
    );
    if (claimedManual) return;

    const categoryId = await findOrCreateCategoryByName(tx, userId, categoryName, month, year);
    const inserted = await tx
      .insert(budgetTransactions)
      .values({
        userId,
        categoryId,
        description: payment.description || '',
        amount: amount.toString(),
        date: dateStr,
        merchant: payment.counterpartyAlias.displayName || '',
        bunqTransactionId,
        bunqMcc: payment.counterpartyAlias.merchantCategoryCode,
        bunqPaymentType: payment.type || null,
        counterpartyIban: payment.counterpartyAlias.iban,
      })
      .onConflictDoNothing({
        target: [budgetTransactions.userId, budgetTransactions.bunqTransactionId],
      })
      .returning({ id: budgetTransactions.id });

    if (inserted.length === 0) return;

    await tx
      .update(budgetCategories)
      .set({
        spent: sql`${budgetCategories.spent} + ${amount.toString()}`,
      })
      .where(eq(budgetCategories.id, categoryId));
  });
}

function collectOwnIbans(accounts: readonly BunqMonetaryAccount[]): Set<string> {
  return new Set(accounts.map((a) => a.iban).filter((iban): iban is string => iban !== null));
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
      bunqUserId,
      ...(updateCursor ? { lastSyncAt: syncedAt } : {}),
    })
    .where(eq(bunqConnections.id, connectionId));
}

async function markSyncFailed(connectionId: number, message: string): Promise<void> {
  await db
    .update(bunqConnections)
    .set({ syncStatus: 'error', syncError: message })
    .where(eq(bunqConnections.id, connectionId));
}

async function importBudgetPaymentsForAccount(params: {
  userId: number;
  account: BunqMonetaryAccount;
  sessionToken: string;
  bunqUserId: string;
  ownIbans: ReadonlySet<string>;
  newerThan: string | undefined;
}): Promise<BunqSyncIssue[]> {
  const payments = await fetchPayments(
    params.sessionToken,
    params.bunqUserId,
    params.account.id,
    params.newerThan,
  );
  const issues: BunqSyncIssue[] = [];
  for (const payment of payments) {
    try {
      await importBudgetPayment(
        params.userId,
        payment,
        params.ownIbans,
        params.bunqUserId,
        params.account.balance.currency,
      );
    } catch (error) {
      issues.push({
        accountId: params.account.id,
        paymentId: String(payment.id),
        message: error instanceof Error ? error.message : 'Budget payment import failed',
      });
    }
  }
  return issues;
}

async function finishBudgetSync(params: {
  connection: BunqConnectionRow;
  bunqUserId: string;
  syncedAt: Date;
  issues: BunqSyncIssue[];
  updateCursor: boolean;
}): Promise<BunqSyncResult> {
  if (params.issues.length > 0) {
    await markSyncFailed(
      params.connection.id,
      `${params.issues.length} Bunq budget payment(s) failed to import`,
    );
    return { status: 'partial', syncedAt: params.syncedAt, issues: params.issues };
  }

  await markSyncSucceeded(
    params.connection.id,
    params.bunqUserId,
    params.syncedAt,
    params.updateCursor,
  );
  return { status: 'success', syncedAt: params.syncedAt, issues: [] };
}

export async function syncBunqBudget(
  userId: number,
  newerThanOverride?: string,
  skipCursorUpdate = false,
): Promise<BunqSyncResult> {
  const connection = await loadConnection(userId);
  if (!connection) return { status: 'skipped', syncedAt: null, issues: [] };

  await markSyncing(connection.id);
  const issues: BunqSyncIssue[] = [];

  try {
    const session = await ensureSession(connection);
    const accounts = await fetchMonetaryAccounts(session.sessionToken, session.bunqUserId);
    const ownIbans = collectOwnIbans(accounts);
    const bankAccounts = accounts.filter((a) => a.type === 'BANK');
    const newerThan =
      newerThanOverride ??
      (connection.lastSyncAt ? connection.lastSyncAt.toISOString() : undefined);

    for (const account of bankAccounts) {
      issues.push(
        ...(await importBudgetPaymentsForAccount({
          userId,
          account,
          sessionToken: session.sessionToken,
          bunqUserId: session.bunqUserId,
          ownIbans,
          newerThan,
        })),
      );
    }

    const syncedAt = new Date();
    return finishBudgetSync({
      connection,
      bunqUserId: session.bunqUserId,
      syncedAt,
      issues,
      updateCursor: !skipCursorUpdate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await markSyncFailed(connection.id, message);
    throw error;
  }
}
