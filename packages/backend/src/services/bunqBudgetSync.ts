import { normalizeBudgetTransactionMoney } from '../lib/budgetCurrency';
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  MONTH_ABBREVIATIONS,
  type BudgetMonth,
  type CurrencyCode,
  toIsoDate,
  isCurrencyCode,
} from '@quro/shared';
import { db, type DbTransaction } from '../db/client';
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
import { toBunqNewerThanCursor } from '../lib/bunqSyncCursor';
import {
  CATEGORY_PRESETS,
  DEFAULT_CATEGORY_PRESET,
  MCC_DEFAULTS,
  UNCATEGORISED_NAME,
} from './bunqCategoryRules';

const MCC_SOURCE = 'mcc';

type BunqConnectionRow = typeof bunqConnections.$inferSelect;
type BudgetCategoryTemplate = {
  budgeted: number;
  currencyNeedsReview: boolean;
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
  if (!trimmed) return toIsoDate(new Date());
  return trimmed.slice(0, 10);
}

function parseMonthYear(dateStr: string): { month: BudgetMonth; year: number } {
  const [yearStr, monthStr] = dateStr.split('-');
  const monthIndex = parseInt(monthStr, 10) - 1;
  if (Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex >= MONTH_ABBREVIATIONS.length) {
    throw new Error(`Invalid Bunq payment date: ${dateStr}`);
  }
  const month = MONTH_ABBREVIATIONS[monthIndex];
  const year = parseInt(yearStr, 10);
  if (!month || Number.isNaN(year)) {
    throw new Error(`Invalid Bunq payment date: ${dateStr}`);
  }
  return { month, year };
}

const budgetCategoryMonthIndex = sql<number>`case
  ${sql.join(
    MONTH_ABBREVIATIONS.map(
      (month, index) =>
        sql`when ${budgetCategories.month} = ${sql.raw(`'${month}'`)} then ${sql.raw(String(index))}`,
    ),
    sql.raw(' '),
  )}
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
      currencyNeedsReview: budgetCategories.currencyNeedsReview,
      emoji: budgetCategories.emoji,
      color: budgetCategories.color,
    })
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.userId, userId),
        eq(budgetCategories.name, name),
        gt(budgetCategories.budgeted, 0),
      ),
    )
    .orderBy(desc(budgetCategories.year), desc(budgetCategoryMonthIndex), desc(budgetCategories.id))
    .limit(1);

  return template ?? null;
}

function categoryTemplateValues(
  template: BudgetCategoryTemplate | null,
  preset: typeof DEFAULT_CATEGORY_PRESET,
) {
  return {
    emoji: template?.emoji ?? preset.emoji,
    budgeted: template?.budgeted ?? 0,
    currencyNeedsReview: template?.currencyNeedsReview ?? false,
    color: template?.color ?? preset.color,
  };
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

  const categoryPreset = Object.hasOwn(CATEGORY_PRESETS, name) ? CATEGORY_PRESETS[name] : undefined;
  const preset = categoryPreset ?? DEFAULT_CATEGORY_PRESET;
  const template = await findLatestCategoryTemplate(tx, userId, name);
  const [inserted] = await tx
    .insert(budgetCategories)
    .values({
      userId,
      name,
      ...categoryTemplateValues(template, preset),
      spent: 0,
      month,
      year,
      expenseClass: preset.expenseClass,
      expenseClassConfirmed: categoryPreset !== undefined,
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
  account: BunqMonetaryAccount,
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
        or(
          and(
            eq(budgetTransactions.sourceAmount, amount),
            eq(budgetTransactions.sourceCurrency, payment.amount.currency as CurrencyCode),
          ),
          and(
            eq(budgetTransactions.amount, amount),
            isNull(budgetTransactions.sourceCurrency),
            sql`${payment.amount.currency} = 'EUR'`,
          ),
        ),
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
      sourceProvider: 'bunq',
      sourceAmount: amount,
      sourceCurrency: payment.amount.currency as CurrencyCode,
      currencyNeedsReview: false,
      sourceAccountId: String(account.id),
      sourceAccountName: account.description || null,
      sourceAccountType: account.type,
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

// Re-import can recover an ambiguous legacy payment once Bunq supplies its
// currency again. Confirmed payments remain idempotent even if FX rates change.
async function repairLegacyBudgetPayment(
  tx: DbTransaction,
  userId: number,
  bunqTransactionId: string,
  money: Awaited<
    ReturnType<typeof normalizeBudgetTransactionMoney<{ amount: number; currency: CurrencyCode }>>
  >,
): Promise<boolean> {
  const [existing] = await tx
    .select()
    .from(budgetTransactions)
    .where(
      and(
        eq(budgetTransactions.userId, userId),
        eq(budgetTransactions.bunqTransactionId, bunqTransactionId),
      ),
    )
    .for('update');
  if (!existing) return false;
  if (existing.currencyNeedsReview) {
    await tx.update(budgetTransactions).set(money).where(eq(budgetTransactions.id, existing.id));
    await tx
      .update(budgetCategories)
      .set({
        spent: sql`GREATEST(0, ${budgetCategories.spent} + ${money.amount - existing.amount}::numeric)`,
      })
      .where(eq(budgetCategories.id, existing.categoryId));
  }
  return true;
}

export async function importBudgetPayment(
  userId: number,
  payment: BunqPayment,
  account: BunqMonetaryAccount,
  ownIbans: ReadonlySet<string>,
  bunqUserId: string,
): Promise<void> {
  if (!isDebit(payment)) return;
  if (isSelfTransfer(payment, ownIbans, bunqUserId)) return;
  if (payment.amount.currency !== account.balance.currency) return;

  const dateStr = toTransactionDate(payment.created);
  const { month, year } = parseMonthYear(dateStr);
  const amount = Math.abs(Number(payment.amount.value) || 0);
  if (amount <= 0) return;
  if (!isCurrencyCode(payment.amount.currency))
    throw new Error('Unsupported Bunq payment currency');
  const money = await normalizeBudgetTransactionMoney({
    amount,
    currency: payment.amount.currency,
  });
  const bunqTransactionId = String(payment.id);

  const categoryName = await resolveCategoryName(userId, payment);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'bunq-budget:' + userId}))`);
    if (await repairLegacyBudgetPayment(tx, userId, bunqTransactionId, money)) return;
    const claimedManual = await claimMatchingManualBudgetTransaction(
      tx,
      userId,
      payment,
      account,
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
        ...money,
        date: dateStr,
        merchant: payment.counterpartyAlias.displayName || '',
        bunqTransactionId,
        bunqMcc: payment.counterpartyAlias.merchantCategoryCode,
        bunqPaymentType: payment.type || null,
        sourceProvider: 'bunq',
        sourceAccountId: String(account.id),
        sourceAccountName: account.description || null,
        sourceAccountType: account.type,
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
        spent: sql`${budgetCategories.spent} + ${money.amount}`,
      })
      .where(eq(budgetCategories.id, categoryId));
  });
}

type PreparedBudgetPayment = {
  payment: BunqPayment;
  date: string;
  month: BudgetMonth;
  year: number;
  nativeAmount: number;
  money: Awaited<
    ReturnType<typeof normalizeBudgetTransactionMoney<{ amount: number; currency: CurrencyCode }>>
  >;
};

function shouldImportBudgetPayment(
  payment: BunqPayment,
  account: BunqMonetaryAccount,
  ownIbans: ReadonlySet<string>,
  bunqUserId: string,
): boolean {
  return (
    isDebit(payment) &&
    !isSelfTransfer(payment, ownIbans, bunqUserId) &&
    payment.amount.currency === account.balance.currency
  );
}

async function prepareBudgetPayments(
  payments: readonly BunqPayment[],
  account: BunqMonetaryAccount,
  ownIbans: ReadonlySet<string>,
  bunqUserId: string,
): Promise<{ prepared: PreparedBudgetPayment[]; issues: BunqSyncIssue[] }> {
  const prepared: PreparedBudgetPayment[] = [];
  const issues: BunqSyncIssue[] = [];
  const seen = new Set<string>();
  for (const payment of payments) {
    if (!shouldImportBudgetPayment(payment, account, ownIbans, bunqUserId)) continue;
    const nativeAmount = Math.abs(Number(payment.amount.value) || 0);
    if (nativeAmount <= 0 || seen.has(String(payment.id))) continue;
    seen.add(String(payment.id));
    try {
      if (!isCurrencyCode(payment.amount.currency))
        throw new Error('Unsupported Bunq payment currency');
      const date = toTransactionDate(payment.created);
      prepared.push({
        payment,
        date,
        ...parseMonthYear(date),
        nativeAmount,
        money: await normalizeBudgetTransactionMoney({
          amount: nativeAmount,
          currency: payment.amount.currency,
        }),
      });
    } catch (error) {
      issues.push({
        accountId: account.id,
        paymentId: String(payment.id),
        message: error instanceof Error ? error.message : 'Budget payment import failed',
      });
    }
  }
  return { prepared, issues };
}

function categoryKey(name: string, month: string, year: number): string {
  return JSON.stringify([name, month, year]);
}

async function loadBatchMappings(tx: DbTransaction, userId: number, rows: PreparedBudgetPayment[]) {
  const defaults = new Map<string, string>();
  for (const { payment } of rows) {
    const mcc = payment.counterpartyAlias.merchantCategoryCode;
    if (mcc && MCC_DEFAULTS[mcc]) defaults.set(mcc, MCC_DEFAULTS[mcc]);
  }
  if (defaults.size)
    await tx
      .insert(categoryMappings)
      .values(
        [...defaults].map(([sourceKey, categoryName]) => ({
          userId,
          source: MCC_SOURCE,
          sourceKey,
          categoryName,
        })),
      )
      .onConflictDoNothing();
  const mappings = await tx
    .select()
    .from(categoryMappings)
    .where(and(eq(categoryMappings.userId, userId), eq(categoryMappings.source, MCC_SOURCE)));
  return new Map(mappings.map((mapping) => [mapping.sourceKey, mapping.categoryName]));
}

function buildMissingCategories(
  userId: number,
  rows: PreparedBudgetPayment[],
  mappings: Map<string, string>,
  categories: Map<string, number>,
  templates: Map<string, BudgetCategoryTemplate>,
) {
  const missing = new Map<string, typeof budgetCategories.$inferInsert>();
  for (const row of rows) {
    const name = batchCategoryName(row.payment, mappings);
    const key = categoryKey(name, row.month, row.year);
    if (categories.has(key) || missing.has(key)) continue;
    const preset = Object.hasOwn(CATEGORY_PRESETS, name) ? CATEGORY_PRESETS[name] : undefined;
    missing.set(key, {
      userId,
      name,
      month: row.month,
      year: row.year,
      spent: 0,
      ...categoryTemplateValues(templates.get(name) ?? null, preset ?? DEFAULT_CATEGORY_PRESET),
      expenseClass: (preset ?? DEFAULT_CATEGORY_PRESET).expenseClass,
      expenseClassConfirmed: preset !== undefined,
    });
  }
  return missing;
}

function batchCategoryName(payment: BunqPayment, mappings: Map<string, string>): string {
  const mcc = payment.counterpartyAlias.merchantCategoryCode;
  return (mcc && mappings.get(mcc)) || UNCATEGORISED_NAME;
}

async function loadBatchCategories(
  tx: DbTransaction,
  userId: number,
  rows: PreparedBudgetPayment[],
  mappings: Map<string, string>,
) {
  const existing = await tx
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.userId, userId))
    .orderBy(
      desc(budgetCategories.year),
      desc(budgetCategoryMonthIndex),
      desc(budgetCategories.id),
    );
  const categories = new Map(
    existing.map((row) => [categoryKey(row.name, row.month, row.year), row.id]),
  );
  const templates = new Map<string, BudgetCategoryTemplate>();
  for (const category of existing) {
    if (category.budgeted > 0 && !templates.has(category.name))
      templates.set(category.name, category);
  }
  const missing = buildMissingCategories(userId, rows, mappings, categories, templates);
  if (missing.size) {
    const created = await tx
      .insert(budgetCategories)
      .values([...missing.values()])
      .onConflictDoUpdate({
        target: [
          budgetCategories.userId,
          budgetCategories.month,
          budgetCategories.year,
          budgetCategories.name,
        ],
        set: { name: sql`excluded.name` },
      })
      .returning();
    for (const category of created)
      categories.set(categoryKey(category.name, category.month, category.year), category.id);
  }
  return categories;
}

function manualPaymentKey(
  date: string,
  merchant: string,
  description: string,
  amount: number,
  currency: string,
): string {
  return JSON.stringify([date, merchant, description, amount, currency]);
}

async function reconcileBatchPayments(
  tx: DbTransaction,
  userId: number,
  rows: PreparedBudgetPayment[],
  account: BunqMonetaryAccount,
): Promise<PreparedBudgetPayment[]> {
  const existing = await tx
    .select()
    .from(budgetTransactions)
    .where(
      and(
        eq(budgetTransactions.userId, userId),
        inArray(
          budgetTransactions.bunqTransactionId,
          rows.map(({ payment }) => String(payment.id)),
        ),
      ),
    );
  const imported = new Map(existing.map((row) => [row.bunqTransactionId, row]));
  const manual = await tx
    .select()
    .from(budgetTransactions)
    .where(
      and(
        eq(budgetTransactions.userId, userId),
        isNull(budgetTransactions.bunqTransactionId),
        inArray(budgetTransactions.date, [...new Set(rows.map((row) => row.date))]),
      ),
    );
  const manualKeys = new Set(
    manual.map((row) =>
      manualPaymentKey(
        row.date,
        row.merchant,
        row.description,
        row.sourceAmount ?? row.amount,
        row.sourceCurrency ?? 'EUR',
      ),
    ),
  );
  const pending: PreparedBudgetPayment[] = [];
  for (const row of rows) {
    const id = String(row.payment.id);
    const previous = imported.get(id);
    if (previous) {
      if (previous.currencyNeedsReview) await repairLegacyBudgetPayment(tx, userId, id, row.money);
      continue;
    }
    const key = manualPaymentKey(
      row.date,
      row.payment.counterpartyAlias.displayName || '',
      row.payment.description || '',
      row.nativeAmount,
      row.payment.amount.currency,
    );
    if (
      manualKeys.has(key) &&
      (await claimMatchingManualBudgetTransaction(
        tx,
        userId,
        row.payment,
        account,
        row.nativeAmount,
        row.date,
        id,
      ))
    )
      continue;
    pending.push(row);
  }
  return pending;
}

function batchTransactionValues(
  userId: number,
  row: PreparedBudgetPayment,
  account: BunqMonetaryAccount,
  categoryId: number,
) {
  return {
    userId,
    categoryId,
    description: row.payment.description || '',
    ...row.money,
    date: row.date,
    merchant: row.payment.counterpartyAlias.displayName || '',
    bunqTransactionId: String(row.payment.id),
    bunqMcc: row.payment.counterpartyAlias.merchantCategoryCode,
    bunqPaymentType: row.payment.type || null,
    sourceProvider: 'bunq',
    sourceAccountId: String(account.id),
    sourceAccountName: account.description || null,
    sourceAccountType: account.type,
    counterpartyIban: row.payment.counterpartyAlias.iban,
  };
}

async function persistBudgetBatch(
  userId: number,
  rows: PreparedBudgetPayment[],
  account: BunqMonetaryAccount,
): Promise<void> {
  if (!rows.length) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'bunq-budget:' + userId}))`);
    const mappings = await loadBatchMappings(tx, userId, rows);
    const pending = await reconcileBatchPayments(tx, userId, rows, account);
    if (!pending.length) return;
    const categories = await loadBatchCategories(tx, userId, pending, mappings);
    const inserted = await tx
      .insert(budgetTransactions)
      .values(
        pending.map((row) => {
          const mcc = row.payment.counterpartyAlias.merchantCategoryCode;
          const name = (mcc && mappings.get(mcc)) || UNCATEGORISED_NAME;
          return batchTransactionValues(
            userId,
            row,
            account,
            categories.get(categoryKey(name, row.month, row.year))!,
          );
        }),
      )
      .onConflictDoNothing({
        target: [budgetTransactions.userId, budgetTransactions.bunqTransactionId],
      })
      .returning({ categoryId: budgetTransactions.categoryId, amount: budgetTransactions.amount });
    if (!inserted.length) return;
    const spentByCategory = new Map<number, number>();
    for (const row of inserted)
      spentByCategory.set(row.categoryId, (spentByCategory.get(row.categoryId) ?? 0) + row.amount);
    const deltas = sql.join(
      [...spentByCategory].map(([id, amount]) => sql`(${id}::integer, ${amount}::numeric)`),
      sql`, `,
    );
    await tx.execute(sql`update budget_categories as c set spent = c.spent + v.amount
      from (values ${deltas}) as v(id, amount) where c.id = v.id and c.user_id = ${userId}`);
  });
}

const BUDGET_IMPORT_BATCH_SIZE = 500;

async function importBudgetBatchIndividually(
  userId: number,
  rows: PreparedBudgetPayment[],
  account: BunqMonetaryAccount,
  ownIbans: ReadonlySet<string>,
  bunqUserId: string,
): Promise<BunqSyncIssue[]> {
  const issues: BunqSyncIssue[] = [];
  for (const { payment } of rows) {
    try {
      await importBudgetPayment(userId, payment, account, ownIbans, bunqUserId);
    } catch (error) {
      issues.push({
        accountId: account.id,
        paymentId: String(payment.id),
        message: error instanceof Error ? error.message : 'Budget payment import failed',
      });
    }
  }
  return issues;
}

export async function importBudgetPaymentBatch(
  userId: number,
  payments: readonly BunqPayment[],
  account: BunqMonetaryAccount,
  ownIbans: ReadonlySet<string>,
  bunqUserId: string,
): Promise<BunqSyncIssue[]> {
  const { prepared, issues } = await prepareBudgetPayments(payments, account, ownIbans, bunqUserId);
  for (let offset = 0; offset < prepared.length; offset += BUDGET_IMPORT_BATCH_SIZE) {
    const batch = prepared.slice(offset, offset + BUDGET_IMPORT_BATCH_SIZE);
    try {
      await persistBudgetBatch(userId, batch, account);
    } catch (error) {
      console.warn('[bunq-budget-sync] Batch failed, retrying payments individually', error);
      issues.push(
        ...(await importBudgetBatchIndividually(userId, batch, account, ownIbans, bunqUserId)),
      );
    }
  }
  return issues;
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
  return importBudgetPaymentBatch(
    params.userId,
    payments,
    params.account,
    params.ownIbans,
    params.bunqUserId,
  );
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
    const bankAccounts = accounts.filter((a) => a.type === 'BANK' || a.type === 'JOINT');
    const newerThan = newerThanOverride ?? toBunqNewerThanCursor(connection.lastSyncAt);

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
