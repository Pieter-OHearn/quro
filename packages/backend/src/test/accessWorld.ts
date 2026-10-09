import { getTableColumns, getTableName, inArray, isTable, like, or } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import * as schema from '../db/schema';
import {
  bunqConnections,
  bunqPaymentProgress,
  budgetCategories,
  budgetTransactions,
  categoryMappings,
  debtPayments,
  debts,
  employments,
  goals,
  holdingPriceHistory,
  holdingTransactions,
  holdings,
  mortgageTransactions,
  mortgages,
  netWorthSnapshots,
  partnerLinkMembers,
  partnerLinks,
  payslips,
  pensionPots,
  pensionStatementImportRows,
  pensionStatementImports,
  pensionTransactions,
  planAssumptions,
  properties,
  propertyTransactions,
  savingsAccounts,
  savingsTransactions,
  sessions,
  users,
} from '../db/schema';
import { hashSessionToken } from '../lib/sessions';
import { createIntegrationHelpers, insertPartnerLink, type AuthSession } from './integration';

/** Ids of one complete set of synthetic rows. Every text field carries `marker`. */
export type RowIds = {
  marker: string;
  savingsAccount: number;
  savingsTxn: number;
  holding: number;
  holdingTxn: number;
  property: number;
  /** A property that is linked to `mortgage`. */
  linkedProperty: number;
  propertyTxn: number;
  mortgage: number;
  mortgageTxn: number;
  pensionPot: number;
  pensionTxn: number;
  pensionImport: number;
  pensionImportRow: number;
  debt: number;
  debtPayment: number;
  goal: number;
  budgetCategory: number;
  /** A category with no transactions, so it can be deleted. */
  emptyBudgetCategory: number;
  budgetTxn: number;
  categoryMapping: number;
  payslip: number;
  employment: number;
  /** Digest id of a second session of the owner (the one a DELETE may remove). */
  extraSession: string;
};

export type IdKey = Exclude<keyof RowIds, 'marker' | 'extraSession'>;

export const ID_KEYS: readonly IdKey[] = [
  'savingsAccount',
  'savingsTxn',
  'holding',
  'holdingTxn',
  'property',
  'linkedProperty',
  'propertyTxn',
  'mortgage',
  'mortgageTxn',
  'pensionPot',
  'pensionTxn',
  'pensionImport',
  'pensionImportRow',
  'debt',
  'debtPayment',
  'goal',
  'budgetCategory',
  'emptyBudgetCategory',
  'budgetTxn',
  'categoryMapping',
  'payslip',
  'employment',
];

/** Ids that are valid integers but belong to no row. */
export const NONEXISTENT_ID = 2_000_000_000;

export function nonexistentRows(): RowIds {
  const rows = { marker: 's04-nonexistent', extraSession: 'f'.repeat(64) } as RowIds;
  for (const key of ID_KEYS) rows[key] = NONEXISTENT_ID;
  return rows;
}

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n%synthetic fixture\n');

export type DocumentStore = (key: string, bytes: Uint8Array) => void;

type SeedOptions = {
  userId: number;
  marker: string;
  isJoint: boolean;
  /** Rows that exist once per user (employment primary flag, bunq connection, assumptions). */
  includeSingletons: boolean;
  storeDocument: DocumentStore;
  extraSessionId: string;
};

/**
 * Inserts one row of every household table for a user. `isJoint` only affects the tables that
 * can be shared with a partner (savings, properties, mortgages and their transactions).
 */
type SeedContext = { userId: number; marker: string; isJoint: boolean; options: SeedOptions };

async function seedSavings(ctx: SeedContext) {
  const { userId, marker, isJoint } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const [savingsAccount] = await db
    .insert(schema.savingsAccounts)
    .values({
      userId,
      name: m('savings'),
      bank: m('bank'),
      balance: 1000,
      currency: 'EUR',
      interestRate: 1,
      accountType: 'Savings',
      isJoint,
    })
    .returning();
  const [savingsTxn] = await db
    .insert(savingsTransactions)
    .values({
      userId,
      accountId: savingsAccount.id,
      type: 'deposit',
      amount: 100,
      date: '2026-03-01',
      note: m('savings-note'),
    })
    .returning();

  return { savingsAccount: savingsAccount.id, savingsTxn: savingsTxn.id };
}

async function seedHoldings(ctx: SeedContext) {
  const { userId, marker } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const [holding] = await db
    .insert(holdings)
    .values({
      userId,
      name: m('holding'),
      ticker: 'S04',
      currentPrice: 10,
      currency: 'EUR',
      sector: 'Test',
    })
    .returning();
  const [holdingTxn] = await db
    .insert(holdingTransactions)
    .values({
      userId,
      holdingId: holding.id,
      type: 'buy',
      shares: 5,
      price: 10,
      date: '2026-03-01',
      note: m('holding-note'),
    })
    .returning();
  await db.insert(holdingPriceHistory).values({
    userId,
    holdingId: holding.id,
    eodDate: '2026-03-01',
    closePrice: 10,
    priceCurrency: 'EUR',
  });

  return { holding: holding.id, holdingTxn: holdingTxn.id };
}

async function seedProperties(ctx: SeedContext) {
  const { userId, marker, isJoint } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const [property] = await db
    .insert(properties)
    .values({
      userId,
      address: m('property'),
      propertyType: 'House',
      purchasePrice: 200000,
      currentValue: 250000,
      mortgage: 100000,
      monthlyRent: 0,
      currency: 'EUR',
      isJoint,
    })
    .returning();
  const [propertyTxn] = await db
    .insert(propertyTransactions)
    .values({
      userId,
      propertyId: property.id,
      type: 'repayment',
      amount: 1200,
      interest: 200,
      principal: 1000,
      date: '2026-03-01',
      note: m('property-note'),
    })
    .returning();

  return { property: property.id, propertyTxn: propertyTxn.id };
}

async function seedMortgages(ctx: SeedContext) {
  const { userId, marker, isJoint } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const [mortgage] = await db
    .insert(mortgages)
    .values({
      userId,
      propertyAddress: m('mortgage-address'),
      lender: m('lender'),
      currency: 'EUR',
      originalAmount: 300000,
      outstandingBalance: 250000,
      propertyValue: 400000,
      monthlyPayment: 1500,
      interestRate: 3,
      rateType: 'Fixed',
      repaymentType: 'Annuity',
      fixedUntil: '2031-06-30',
      termYears: 30,
      startDate: '2025-01-01',
      endDate: '2055-01-01',
      isJoint,
    })
    .returning();
  const [mortgageTxn] = await db
    .insert(mortgageTransactions)
    .values({
      userId,
      mortgageId: mortgage.id,
      type: 'repayment',
      amount: 1500,
      interest: 500,
      principal: 1000,
      date: '2026-03-01',
      note: m('mortgage-note'),
    })
    .returning();

  const [linkedProperty] = await db
    .insert(properties)
    .values({
      userId,
      address: m('linked-property'),
      propertyType: 'House',
      purchasePrice: 400000,
      currentValue: 400000,
      mortgage: 0,
      mortgageId: mortgage.id,
      monthlyRent: 0,
      currency: 'EUR',
      isJoint,
    })
    .returning();

  return { mortgage: mortgage.id, mortgageTxn: mortgageTxn.id, linkedProperty: linkedProperty.id };
}

async function seedPensionImport(ctx: SeedContext, potId: number) {
  const { userId, marker, options } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const importKey = `s04/${marker}/import.pdf`;
  options.storeDocument(importKey, PDF_BYTES);
  const [pensionImport] = await db
    .insert(pensionStatementImports)
    .values({
      userId,
      potId,
      status: 'ready_for_review',
      storageKey: importKey,
      fileName: 'import.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF_BYTES.byteLength,
      fileHashSha256: m('hash'),
      statementPeriodStart: '2025-01-01',
      statementPeriodEnd: '2025-12-31',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    })
    .returning();
  const [pensionImportRow] = await db
    .insert(pensionStatementImportRows)
    .values({
      importId: pensionImport.id,
      rowOrder: 1,
      type: 'annual_statement',
      amount: 5000,
      taxAmount: 0,
      date: '2025-12-31',
      note: m('import-row-note'),
    })
    .returning();
  await db.insert(pensionStatementImportRows).values({
    importId: pensionImport.id,
    rowOrder: 2,
    type: 'contribution',
    amount: 100,
    taxAmount: 0,
    date: '2025-06-30',
    note: m('import-row-contribution'),
    isEmployer: false,
  });

  return { pensionImport: pensionImport.id, pensionImportRow: pensionImportRow.id };
}

async function seedPensions(ctx: SeedContext) {
  const { userId, marker, options } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const pensionDocumentKey = `s04/${marker}/pension-statement.pdf`;
  options.storeDocument(pensionDocumentKey, PDF_BYTES);
  const [pensionPot] = await db
    .insert(pensionPots)
    .values({
      userId,
      name: m('pot'),
      provider: m('provider'),
      type: 'Personal Pension',
      balance: 5000,
      currency: 'EUR',
      employeeMonthly: 0,
      employerMonthly: 0,
      notes: m('pot-notes'),
    })
    .returning();
  const [pensionTxn] = await db
    .insert(pensionTransactions)
    .values({
      userId,
      potId: pensionPot.id,
      type: 'annual_statement',
      amount: 5000,
      date: '2026-03-01',
      note: m('pension-note'),
      documentStorageKey: pensionDocumentKey,
      documentFileName: `${marker}:statement.pdf`,
      documentSizeBytes: PDF_BYTES.byteLength,
      documentUploadedAt: new Date('2026-03-02T00:00:00Z'),
    })
    .returning();
  const imported = await seedPensionImport(ctx, pensionPot.id);

  return {
    pensionPot: pensionPot.id,
    pensionTxn: pensionTxn.id,
    ...imported,
  };
}

async function seedDebts(ctx: SeedContext) {
  const { userId, marker } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const [debt] = await db
    .insert(debts)
    .values({
      userId,
      name: m('debt'),
      type: 'credit_card',
      lender: m('debt-lender'),
      originalAmount: 5000,
      remainingBalance: 4000,
      currency: 'EUR',
      interestRate: 5,
      monthlyPayment: 100,
      startDate: '2025-01-01',
      color: '#111111',
      emoji: '💳',
      notes: m('debt-notes'),
    })
    .returning();
  const [debtPayment] = await db
    .insert(debtPayments)
    .values({
      userId,
      debtId: debt.id,
      date: '2026-03-01',
      amount: 100,
      principal: 90,
      interest: 10,
      note: m('debt-payment-note'),
    })
    .returning();

  return { debt: debt.id, debtPayment: debtPayment.id };
}

async function seedGoals(ctx: SeedContext) {
  const { userId, marker } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const [goal] = await db
    .insert(goals)
    .values({
      userId,
      type: 'annual',
      year: 2026,
      name: m('goal'),
      currentAmount: 10,
      targetAmount: 100,
      deadline: '2030-01-01',
      category: 'savings',
      monthlyContribution: 5,
      notes: m('goal-notes'),
    })
    .returning();

  return { goal: goal.id };
}

async function seedBudget(ctx: SeedContext) {
  const { userId, marker } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const [budgetCategory] = await db
    .insert(budgetCategories)
    .values({
      userId,
      name: m('category'),
      budgeted: 100,
      spent: 25,
      month: 'Mar',
      year: 2026,
    })
    .returning();
  const [emptyBudgetCategory] = await db
    .insert(budgetCategories)
    .values({
      userId,
      name: m('empty-category'),
      budgeted: 10,
      spent: 0,
      month: 'Mar',
      year: 2026,
    })
    .returning();
  const [budgetTxn] = await db
    .insert(budgetTransactions)
    .values({
      userId,
      categoryId: budgetCategory.id,
      description: m('budget-description'),
      amount: 25,
      date: '2026-03-01',
      merchant: m('merchant'),
    })
    .returning();
  const [categoryMapping] = await db
    .insert(categoryMappings)
    .values({
      userId,
      source: 'merchant',
      sourceKey: m('mapping-key'),
      categoryName: m('mapping-category'),
    })
    .returning();

  return {
    budgetCategory: budgetCategory.id,
    emptyBudgetCategory: emptyBudgetCategory.id,
    budgetTxn: budgetTxn.id,
    categoryMapping: categoryMapping.id,
  };
}

async function seedSalary(ctx: SeedContext) {
  const { userId, marker, options } = ctx;
  const m = (suffix: string) => `${marker}:${suffix}`;

  const payslipKey = `s04/${marker}/payslip.pdf`;
  options.storeDocument(payslipKey, PDF_BYTES);
  const [employment] = await db
    .insert(employments)
    .values({
      userId,
      employerName: m('employer'),
      employmentType: 'employed',
      serviceStartDate: '2020-01-01',
      isPrimary: options.includeSingletons,
    })
    .returning();
  const [payslip] = await db
    .insert(payslips)
    .values({
      userId,
      employmentId: employment.id,
      month: m('month'),
      date: '2026-03-31',
      gross: 5000,
      tax: 1000,
      pension: 200,
      net: 3800,
      currency: 'EUR',
      documentStorageKey: payslipKey,
      documentFileName: `${marker}:payslip.pdf`,
      documentSizeBytes: PDF_BYTES.byteLength,
      documentUploadedAt: new Date('2026-04-01T00:00:00Z'),
    })
    .returning();

  return { employment: employment.id, payslip: payslip.id };
}

async function seedSingletons(ctx: SeedContext) {
  const { userId, marker, options } = ctx;

  if (options.includeSingletons) {
    await db.insert(planAssumptions).values({ userId, leanBurnOverride: 1234 });
    await db.insert(bunqConnections).values({
      userId,
      accessToken: `token-${marker}`,
      privateKey: `key-${marker}`,
      sessionToken: `session-${marker}`,
    });
    await db.insert(netWorthSnapshots).values({
      userId,
      snapshotDate: '2026-02-28',
      baseCurrency: 'EUR',
      savings: 1,
      brokerage: 1,
      propertyEquity: 1,
      pension: 1,
      liabilities: 1,
      totalValue: 4,
    });
  }
}

export async function seedRows(options: SeedOptions): Promise<RowIds> {
  const ctx: SeedContext = {
    userId: options.userId,
    marker: options.marker,
    isJoint: options.isJoint,
    options,
  };
  const savings = await seedSavings(ctx);
  const holdingRows = await seedHoldings(ctx);
  const properties = await seedProperties(ctx);
  const mortgages = await seedMortgages(ctx);
  const pensions = await seedPensions(ctx);
  const debts = await seedDebts(ctx);
  const goals = await seedGoals(ctx);
  const budget = await seedBudget(ctx);
  const salary = await seedSalary(ctx);
  await seedSingletons(ctx);
  return {
    marker: options.marker,
    ...savings,
    ...holdingRows,
    ...properties,
    ...mortgages,
    ...pensions,
    ...debts,
    ...goals,
    ...budget,
    ...salary,
    extraSession: options.extraSessionId,
  } as RowIds;
}

export type Household = {
  /** Rows only their owner may touch. */
  private: RowIds;
  /** Savings, property and mortgage rows shared with the partner. */
  joint: RowIds;
};

export const WORLD_EMAIL_DOMAIN = 's04-access.integration.quro.test';

export type World = {
  integration: ReturnType<typeof createIntegrationHelpers>;
  owner: AuthSession;
  partner: AuthSession;
  stranger: AuthSession;
  strangerPartner: AuthSession;
  /** Was linked to the owner with joint rows, then unlinked through the API. */
  former: AuthSession;
  /** Has a pending, never accepted, invitation from `pendingRequester`. */
  pendingInvitee: AuthSession;
  pendingRequester: AuthSession;
  household: Household;
  strangerHousehold: Household;
  /** Rows the owner and the former partner shared before the unlink. */
  formerOwner: RowIds;
  formerOwn: RowIds;
  pendingRequesterRows: RowIds;
  userIds: number[];
};

async function insertSecondSession(
  integration: World['integration'],
  email: string,
): Promise<string> {
  const second = await integration.signIn(email);
  return hashSessionToken(second.cookie.match(/session=([^;]+)/)![1]);
}

/**
 * Removes every user created for an email domain, including the rows that block `cleanup()`:
 * bank connections are not deleted by the shared helper.
 */
export async function purgeSyntheticUsers(integration: World['integration'], emailDomain: string) {
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `%@${emailDomain}`));
  const ids = found.map((row) => row.id);
  if (ids.length > 0) {
    await db.delete(bunqPaymentProgress).where(inArray(bunqPaymentProgress.userId, ids));
    await db.delete(bunqConnections).where(inArray(bunqConnections.userId, ids));
  }
  await integration.cleanup();
}

async function seedFor(
  integration: World['integration'],
  storeDocument: DocumentStore,
  who: AuthSession,
  marker: string,
  isJoint: boolean,
  includeSingletons: boolean,
): Promise<RowIds> {
  return seedRows({
    userId: who.user.id,
    marker,
    isJoint,
    includeSingletons,
    storeDocument,
    extraSessionId: await insertSecondSession(integration, who.user.email),
  });
}

/** A household seeds one private and one joint set; singletons (plan, bank link) go on the first. */
async function seedHousehold(
  integration: World['integration'],
  storeDocument: DocumentStore,
  who: AuthSession,
  name: string,
): Promise<Household> {
  return {
    private: await seedFor(integration, storeDocument, who, `s04-${name}-private`, false, true),
    joint: await seedFor(integration, storeDocument, who, `s04-${name}-joint`, true, false),
  };
}

/** Builds the households the access matrix runs against. */
export async function createWorld(storeDocument: DocumentStore): Promise<World> {
  const integration = createIntegrationHelpers(WORLD_EMAIL_DOMAIN);
  await purgeSyntheticUsers(integration, WORLD_EMAIL_DOMAIN);

  const owner = await integration.signUp('owner');
  const partner = await integration.signUp('partner');
  const stranger = await integration.signUp('stranger');
  const strangerPartner = await integration.signUp('stranger-partner');
  const former = await integration.signUp('former');
  const pendingRequester = await integration.signUp('pending-requester');
  const pendingInvitee = await integration.signUp('pending-invitee');
  const seed = (who: AuthSession, marker: string, joint: boolean, singletons: boolean) =>
    seedFor(integration, storeDocument, who, marker, joint, singletons);

  // Former partner: a real accepted link with joint rows on both sides, ended through the API.
  await insertPartnerLink(owner.user.id, former.user.id, 'accepted');
  const formerOwner = await seed(owner, 's04-owner-before-unlink', true, false);
  const formerOwn = await seed(former, 's04-former-before-unlink', true, true);
  const unlink = await integration.request('/api/partner', {
    method: 'DELETE',
    cookie: owner.cookie,
  });
  if (unlink.status !== 200)
    throw new Error(`Unlinking the former partner failed: ${unlink.status}`);

  await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
  await insertPartnerLink(stranger.user.id, strangerPartner.user.id, 'accepted');
  await insertPartnerLink(pendingRequester.user.id, pendingInvitee.user.id, 'pending');

  const household = await seedHousehold(integration, storeDocument, owner, 'owner');
  const strangerHousehold = await seedHousehold(integration, storeDocument, stranger, 'stranger');
  // A pending link must grant nothing, even when the requester flags rows as joint.
  const pendingRequesterRows = await seed(pendingRequester, 's04-pending-requester', true, true);

  const everyone = [owner, partner, stranger, strangerPartner, former, pendingRequester];
  return {
    integration,
    owner,
    partner,
    stranger,
    strangerPartner,
    former,
    pendingInvitee,
    pendingRequester,
    household,
    strangerHousehold,
    formerOwner,
    formerOwn,
    pendingRequesterRows,
    userIds: [...everyone, pendingInvitee].map((session) => session.user.id),
  };
}

export async function destroyWorld(integration: World['integration']) {
  await purgeSyntheticUsers(integration, WORLD_EMAIL_DOMAIN);
}

// ── Database snapshots ───────────────────────────────────────────────────────

/** Tables that hold a user's data, keyed by the column that ties a row to the world's users. */
const SNAPSHOT_TABLES: Record<string, PgTable> = {
  users,
  savings_accounts: savingsAccounts,
  savings_transactions: savingsTransactions,
  holdings,
  holding_transactions: holdingTransactions,
  holding_price_history: holdingPriceHistory,
  properties,
  property_transactions: propertyTransactions,
  pension_pots: pensionPots,
  pension_transactions: pensionTransactions,
  pension_statement_imports: pensionStatementImports,
  mortgages,
  mortgage_transactions: mortgageTransactions,
  debts,
  debt_payments: debtPayments,
  payslips,
  goals,
  budget_categories: budgetCategories,
  budget_transactions: budgetTransactions,
  category_mappings: categoryMappings,
  employments,
  plan_assumptions: planAssumptions,
  net_worth_snapshots: netWorthSnapshots,
  bunq_connections: bunqConnections,
  bunq_payment_progress: bunqPaymentProgress,
  partner_link_members: partnerLinkMembers,
};

/** Tables with a `user_id` column that the snapshot deliberately leaves out, and why. */
export const SNAPSHOT_EXEMPT: Record<string, string> = {
  sessions: 'compared by id below; last_used_at is refreshed by authenticated reads',
  auth_codes: 'operator-issued codes, not household data',
  bunq_oauth_attempts: 'short-lived OAuth state, not household data',
};

export function tablesWithUserColumn(): string[] {
  const names: string[] = [];
  for (const value of Object.values(schema) as unknown[]) {
    if (!isTable(value)) continue;
    if ('userId' in getTableColumns(value)) names.push(getTableName(value));
  }
  return names;
}

export function snapshotCoversEveryUserTable(): { missing: string[] } {
  const covered = new Set([...Object.keys(SNAPSHOT_TABLES), ...Object.keys(SNAPSHOT_EXEMPT)]);
  return { missing: tablesWithUserColumn().filter((name) => !covered.has(name)) };
}

/** A stable text image of every row the world's users own, to prove a request changed nothing. */
export async function snapshotWorld(userIds: number[]): Promise<string> {
  const parts: Record<string, unknown> = {};
  for (const [name, table] of Object.entries(SNAPSHOT_TABLES)) {
    const columns = getTableColumns(table) as Record<string, never>;
    const owner = columns.userId ?? columns.id;
    const rows = await db
      .select()
      .from(table)
      .where(inArray(owner, userIds))
      .orderBy(columns.id ?? columns.userId);
    parts[name] = rows;
  }
  const imports = await db
    .select({ id: pensionStatementImports.id })
    .from(pensionStatementImports)
    .where(inArray(pensionStatementImports.userId, userIds));
  parts.pension_statement_import_rows = await db
    .select()
    .from(pensionStatementImportRows)
    .where(
      inArray(
        pensionStatementImportRows.importId,
        imports.map((row) => row.id),
      ),
    )
    .orderBy(pensionStatementImportRows.id);
  parts.partner_links = await db
    .select()
    .from(partnerLinks)
    .where(
      or(inArray(partnerLinks.requesterId, userIds), inArray(partnerLinks.addresseeId, userIds)),
    )
    .orderBy(partnerLinks.id);
  parts.session_ids = (
    await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.userId, userIds))
      .orderBy(sessions.id)
  ).map((row) => row.id);
  return JSON.stringify(parts);
}
