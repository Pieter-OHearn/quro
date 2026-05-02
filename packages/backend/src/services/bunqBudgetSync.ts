import { and, eq, sql } from 'drizzle-orm';
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
      sessionExpiresAt: session.expiresAt,
      bunqUserId: session.bunqUserId,
    })
    .where(eq(bunqConnections.id, connection.id));

  return session;
}

function isDebit(payment: BunqPayment): boolean {
  return payment.amount.value.trim().startsWith('-');
}

function isSelfTransfer(payment: BunqPayment, ownIbans: ReadonlySet<string>): boolean {
  const counterIban = payment.counterpartyAlias.iban;
  return counterIban !== null && ownIbans.has(counterIban);
}

function toTransactionDate(created: string): string {
  const trimmed = created.trim();
  if (!trimmed) return new Date().toISOString().slice(0, 10);
  return trimmed.slice(0, 10);
}

function parseMonthYear(dateStr: string): { month: string; year: number } {
  const [yearStr, monthStr] = dateStr.split('-');
  const monthIndex = parseInt(monthStr, 10) - 1;
  return { month: BUDGET_MONTHS[monthIndex], year: parseInt(yearStr, 10) };
}

async function budgetTxAlreadyImported(
  userId: number,
  bunqTransactionId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: budgetTransactions.id })
    .from(budgetTransactions)
    .where(
      and(
        eq(budgetTransactions.userId, userId),
        eq(budgetTransactions.bunqTransactionId, bunqTransactionId),
      ),
    );
  return Boolean(existing);
}

async function findOrCreateCategoryByName(
  userId: number,
  name: string,
  month: string,
  year: number,
): Promise<number> {
  const [existing] = await db
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
  const [inserted] = await db
    .insert(budgetCategories)
    .values({
      userId,
      name,
      emoji: preset.emoji,
      budgeted: '0',
      spent: '0',
      color: preset.color,
      month,
      year,
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

async function importBudgetPayment(
  userId: number,
  payment: BunqPayment,
  ownIbans: ReadonlySet<string>,
): Promise<void> {
  if (!isDebit(payment)) return;
  if (isSelfTransfer(payment, ownIbans)) return;

  const bunqTransactionId = String(payment.id);
  if (await budgetTxAlreadyImported(userId, bunqTransactionId)) return;

  const dateStr = toTransactionDate(payment.created);
  const { month, year } = parseMonthYear(dateStr);
  const amount = Math.abs(Number(payment.amount.value) || 0);

  const categoryName = await resolveCategoryName(userId, payment);
  const categoryId = await findOrCreateCategoryByName(userId, categoryName, month, year);

  await db.insert(budgetTransactions).values({
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
  });

  await db
    .update(budgetCategories)
    .set({
      spent: sql`${budgetCategories.spent} + ${amount.toString()}`,
    })
    .where(eq(budgetCategories.id, categoryId));
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

async function markSyncSucceeded(connectionId: number, bunqUserId: string): Promise<void> {
  await db
    .update(bunqConnections)
    .set({ syncStatus: 'idle', syncError: null, bunqUserId })
    .where(eq(bunqConnections.id, connectionId));
}

async function markSyncFailed(connectionId: number, message: string): Promise<void> {
  await db
    .update(bunqConnections)
    .set({ syncStatus: 'error', syncError: message })
    .where(eq(bunqConnections.id, connectionId));
}

export async function syncBunqBudget(userId: number, newerThanOverride?: string): Promise<void> {
  const connection = await loadConnection(userId);
  if (!connection) return;

  await markSyncing(connection.id);

  try {
    const session = await ensureSession(connection);
    const accounts = await fetchMonetaryAccounts(session.sessionToken, session.bunqUserId);
    const ownIbans = collectOwnIbans(accounts);
    const bankAccounts = accounts.filter((a) => a.type === 'BANK');
    const newerThan =
      newerThanOverride ??
      (connection.lastSyncAt ? connection.lastSyncAt.toISOString() : undefined);

    for (const account of bankAccounts) {
      const payments = await fetchPayments(
        session.sessionToken,
        session.bunqUserId,
        account.id,
        newerThan,
      );
      for (const payment of payments) {
        await importBudgetPayment(userId, payment, ownIbans);
      }
    }

    await markSyncSucceeded(connection.id, session.bunqUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await markSyncFailed(connection.id, message);
    throw error;
  }
}
