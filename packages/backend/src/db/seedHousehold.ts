import { eq, inArray, notInArray, sql } from 'drizzle-orm';
import { createApp } from '../app';
import { runUnlessMaintenance } from '../lib/maintenanceMode';
import { db, type DbExecutor } from './client';
import {
  BUDGET_CATEGORIES,
  BUDGET_MONTHS,
  DEBTS,
  EMPLOYMENTS,
  GOALS,
  HOLDINGS,
  HOUSEHOLD_AS_OF,
  HOUSEHOLD_EMAILS,
  HOUSEHOLD_TIMESTAMPS,
  MORTGAGE,
  PENSION_POTS,
  PROPERTIES,
  SAVINGS_ACCOUNTS,
  budgetCategoryMonths,
  budgetTransactions,
  buildSeedRateHistory,
  DEPOSIT_PROTECTION,
  expectedSavingsBalance,
  type GoalSpec,
  type Member,
} from './demoHousehold';
import { buildSeedCurrencyRates, SEED_RATE_PROVIDER } from './demoSeed';
import { openHouseholdApi, type HouseholdApi } from './householdApi';
import {
  budgetCategories,
  budgetTransactions as budgetTransactionRows,
  categoryMappings,
  currencyRateHistory,
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
  partnerLinks,
  payslips,
  pensionStatementImports,
  pensionPots,
  pensionTransactions,
  planAssumptions,
  properties,
  propertyTransactions,
  savingsAccounts,
  savingsTransactions,
  users,
} from './schema';
import { CATEGORY_PRESETS } from '../services/bunqCategoryRules';

// Seeds the synthetic household of `db:seed-household`: the two demo users, linked as partners,
// with private and joint rows on every page. It writes through the application's routes (see
// householdApi.ts), so the data is whatever the app itself would store. Running it again resets
// both demo users' rows first, so the result is the same each time.

export class HouseholdSeedRefusedError extends Error {
  constructor(otherUsers: number) {
    super(
      `Refusing to seed the demo household: the database has ${otherUsers} account(s) besides the ` +
        'two demo accounts, so it may hold a real household. Use an empty database or one that ' +
        'only holds the demo accounts. Nothing was changed.',
    );
    this.name = 'HouseholdSeedRefusedError';
  }
}

/** Throws unless every user in the database is one of the demo users. Writes nothing. */
export async function assertOnlyDemoUsers(executor: DbExecutor = db): Promise<void> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(notInArray(users.email, [...HOUSEHOLD_EMAILS]));
  if (row && row.count > 0) throw new HouseholdSeedRefusedError(row.count);
}

type Context = {
  api: Record<Member, HouseholdApi>;
  userIds: Record<Member, number>;
  /** Ids of the rows created so far, by kind and spec key. */
  ids: Map<string, number>;
};

type Created = { id: number };

const rememberId = (context: Context, name: string, created: Created) => {
  context.ids.set(name, created.id);
  return created.id;
};

const idOf = (context: Context, name: string): number => {
  const id = context.ids.get(name);
  if (id === undefined) throw new Error(`The seed refers to ${name} before creating it`);
  return id;
};

// ── Reset ────────────────────────────────────────────────────────────────────

/** Deletes the demo users' rows, children before parents, and the guard runs in the same transaction. */
async function resetHousehold(userIds: readonly number[]): Promise<void> {
  const ids = [...userIds];
  await db.transaction(async (tx) => {
    await assertOnlyDemoUsers(tx);
    await tx.delete(budgetTransactionRows).where(inArray(budgetTransactionRows.userId, ids));
    await tx.delete(budgetCategories).where(inArray(budgetCategories.userId, ids));
    await tx.delete(categoryMappings).where(inArray(categoryMappings.userId, ids));
    await tx.delete(savingsTransactions).where(inArray(savingsTransactions.userId, ids));
    await tx.delete(savingsAccounts).where(inArray(savingsAccounts.userId, ids));
    await tx.delete(holdingTransactions).where(inArray(holdingTransactions.userId, ids));
    await tx.delete(holdingPriceHistory).where(inArray(holdingPriceHistory.userId, ids));
    await tx.delete(holdings).where(inArray(holdings.userId, ids));
    await tx.delete(propertyTransactions).where(inArray(propertyTransactions.userId, ids));
    await tx.delete(properties).where(inArray(properties.userId, ids));
    await tx.delete(mortgageTransactions).where(inArray(mortgageTransactions.userId, ids));
    await tx.delete(mortgages).where(inArray(mortgages.userId, ids));
    await tx.delete(pensionStatementImports).where(inArray(pensionStatementImports.userId, ids));
    await tx.delete(pensionTransactions).where(inArray(pensionTransactions.userId, ids));
    await tx.delete(pensionPots).where(inArray(pensionPots.userId, ids));
    await tx.delete(debtPayments).where(inArray(debtPayments.userId, ids));
    await tx.delete(debts).where(inArray(debts.userId, ids));
    await tx.delete(payslips).where(inArray(payslips.userId, ids));
    await tx.delete(employments).where(inArray(employments.userId, ids));
    await tx.delete(goals).where(inArray(goals.userId, ids));
    await tx.delete(planAssumptions).where(inArray(planAssumptions.userId, ids));
    await tx.delete(netWorthSnapshots).where(inArray(netWorthSnapshots.userId, ids));
    // Rate history is not tied to a user: only the rows this seed wrote are removed.
    await tx
      .delete(currencyRateHistory)
      .where(eq(currencyRateHistory.provider, SEED_RATE_PROVIDER));
    // Members go with the link (cascade).
    await tx.delete(partnerLinks).where(inArray(partnerLinks.requesterId, ids));
  });
}

// ── Steps ────────────────────────────────────────────────────────────────────

async function linkPartners(context: Context, partnerEmail: string): Promise<void> {
  await context.api.demo.post('/api/partner/invite', { email: partnerEmail });
  await context.api.partner.post('/api/partner/accept');
  // The routes stamp the clock; the household states when the partners linked.
  await db.update(partnerLinks).set({
    createdAt: new Date(HOUSEHOLD_TIMESTAMPS.partnerInvitedAt),
    respondedAt: new Date(HOUSEHOLD_TIMESTAMPS.partnerAcceptedAt),
  });
}

async function seedRateHistory(): Promise<void> {
  // The seed's own rates, not whatever the table holds, so the history is the same everywhere.
  const base = buildSeedCurrencyRates(new Date(HOUSEHOLD_TIMESTAMPS.ratesRecordedAt));
  const rows = buildSeedRateHistory(base).map((row) => ({
    ...row,
    provider: SEED_RATE_PROVIDER,
    updatedAt: new Date(HOUSEHOLD_TIMESTAMPS.ratesRecordedAt),
  }));
  // A rate a provider already stored for a day wins; the unique index keeps one per day.
  await db.insert(currencyRateHistory).values(rows).onConflictDoNothing();
}

/** Confirms each account's bank as a licensed entity, so no bank waits for review in the plan. */
async function confirmBankingEntities(context: Context): Promise<void> {
  for (const account of SAVINGS_ACCOUNTS) {
    const protection = DEPOSIT_PROTECTION[account.bank];
    if (!protection) throw new Error(`No deposit protection is defined for ${account.bank}`);
    await context.api[account.owner].patch(
      `/api/savings/accounts/${idOf(context, `savings:${account.key}`)}/banking-entity`,
      { mode: 'manual', entityName: account.bank, ...protection },
    );
  }
  // The route stamps the clock; the household states when the entities were confirmed.
  await db
    .update(savingsAccounts)
    .set({ bankingEntityConfirmedAt: new Date(HOUSEHOLD_TIMESTAMPS.bankingEntitiesConfirmedAt) })
    .where(
      inArray(
        savingsAccounts.id,
        SAVINGS_ACCOUNTS.map((account) => idOf(context, `savings:${account.key}`)),
      ),
    );
}

async function seedSavings(context: Context): Promise<void> {
  for (const account of SAVINGS_ACCOUNTS) {
    const owner = context.api[account.owner];
    const created = await owner.post<Created>('/api/savings/accounts', {
      name: account.name,
      bank: account.bank,
      balance: account.openingBalance,
      currency: account.currency,
      interestRate: account.interestRate,
      accountType: account.accountType,
      color: account.color,
      emoji: account.emoji,
      isJoint: account.isJoint,
    });
    const accountId = rememberId(context, `savings:${account.key}`, created);
    for (const transaction of account.transactions) {
      await context.api[transaction.by].post('/api/savings/transactions', {
        accountId,
        type: transaction.type,
        amount: transaction.amount,
        date: transaction.date,
        note: transaction.note,
      });
    }
  }
}

async function seedHoldings(context: Context): Promise<void> {
  for (const holding of HOLDINGS) {
    const owner = context.api[holding.owner];
    // Fictional tickers: excluded from price sync so no provider is ever asked about them.
    const created = await owner.post<Created>('/api/investments/holdings', {
      name: holding.name,
      ticker: holding.ticker,
      currentPrice: holding.currentPrice,
      currency: holding.currency,
      sector: holding.sector,
      itemType: holding.itemType,
      priceUpdatedAt: HOUSEHOLD_TIMESTAMPS.pricesSyncedAt,
      excludeFromSync: true,
      eodDate: HOUSEHOLD_AS_OF,
      priceCurrency: holding.currency,
    });
    const holdingId = rememberId(context, `holding:${holding.key}`, created);
    for (const transaction of holding.transactions) {
      await owner.post('/api/investments/holding-transactions', {
        holdingId,
        type: transaction.type,
        shares: transaction.shares,
        price: transaction.price,
        date: transaction.date,
        note: transaction.note,
      });
    }
    // The route stored one snapshot at today's price; the history replaces it with the full series.
    await db
      .insert(holdingPriceHistory)
      .values(
        holding.priceHistory.map(([eodDate, closePrice]) => ({
          userId: context.userIds[holding.owner],
          holdingId,
          eodDate,
          closePrice,
          priceCurrency: holding.currency,
          syncedAt: new Date(HOUSEHOLD_TIMESTAMPS.pricesSyncedAt),
        })),
      )
      .onConflictDoUpdate({
        target: [holdingPriceHistory.holdingId, holdingPriceHistory.eodDate],
        set: {
          closePrice: sql`excluded.close_price`,
          priceCurrency: sql`excluded.price_currency`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
  }
}

async function seedProperties(context: Context): Promise<void> {
  for (const property of PROPERTIES) {
    const created = await context.api[property.owner].post<Created>('/api/investments/properties', {
      address: property.address,
      propertyType: property.propertyType,
      purchasePrice: property.purchasePrice,
      currentValue: property.currentValue,
      mortgage: property.manualMortgage,
      monthlyRent: property.monthlyRent,
      currency: property.currency,
      emoji: property.emoji,
      isJoint: property.isJoint,
    });
    rememberId(context, `property:${property.key}`, created);
  }
}

async function seedMortgage(context: Context): Promise<void> {
  const owner = context.api[MORTGAGE.owner];
  const created = await owner.post<Created>('/api/mortgages', {
    linkedPropertyId: idOf(context, `property:${MORTGAGE.propertyKey}`),
    lender: MORTGAGE.lender,
    originalAmount: MORTGAGE.originalAmount,
    outstandingBalance: MORTGAGE.openingBalance,
    monthlyPayment: MORTGAGE.monthlyPayment,
    interestRate: MORTGAGE.interestRate,
    rateType: 'Fixed',
    repaymentType: 'Annuity',
    fixedUntil: MORTGAGE.fixedUntil,
    termYears: MORTGAGE.termYears,
    startDate: MORTGAGE.startDate,
    endDate: MORTGAGE.endDate,
    overpaymentLimit: MORTGAGE.overpaymentLimit,
    isJoint: MORTGAGE.isJoint,
  });
  const mortgageId = rememberId(context, 'mortgage:home', created);
  await owner.post('/api/mortgages/transactions', {
    mortgageId,
    type: 'rate_change',
    amount: MORTGAGE.rateChange.rate,
    fixedYears: MORTGAGE.rateChange.fixedYears,
    date: MORTGAGE.rateChange.date,
    note: MORTGAGE.rateChange.note,
  });
  for (const repayment of MORTGAGE.repayments) {
    await context.api[repayment.by].post('/api/mortgages/transactions', {
      mortgageId,
      type: 'repayment',
      amount: repayment.amount,
      interest: repayment.interest,
      date: repayment.date,
      note: repayment.note,
    });
  }
}

async function seedPropertyLedgers(context: Context): Promise<void> {
  for (const property of PROPERTIES) {
    const propertyId = idOf(context, `property:${property.key}`);
    for (const transaction of property.transactions) {
      await context.api[property.owner].post('/api/investments/property-transactions', {
        propertyId,
        type: transaction.type,
        amount: transaction.amount,
        interest: transaction.type === 'repayment' ? transaction.interest : undefined,
        date: transaction.date,
        note: transaction.note,
      });
    }
  }
}

async function seedPensions(context: Context): Promise<void> {
  for (const pot of PENSION_POTS) {
    const owner = context.api[pot.owner];
    const created = await owner.post<Created>('/api/pensions/pots', {
      name: pot.name,
      provider: pot.provider,
      type: pot.type,
      balance: pot.openingBalance,
      currency: pot.currency,
      employeeMonthly: pot.employeeMonthly,
      employerMonthly: pot.employerMonthly,
      investmentStrategy: pot.investmentStrategy,
      color: pot.color,
      emoji: pot.emoji,
      notes: pot.notes,
    });
    const potId = rememberId(context, `pension:${pot.key}`, created);
    for (const transaction of pot.transactions) {
      await owner.post('/api/pensions/transactions', { potId, ...transaction });
    }
  }
}

async function seedDebts(context: Context): Promise<void> {
  for (const debt of DEBTS) {
    const owner = context.api[debt.owner];
    const created = await owner.post<Created>('/api/debts', {
      name: debt.name,
      type: debt.type,
      lender: debt.lender,
      originalAmount: debt.originalAmount,
      remainingBalance: debt.openingBalance,
      currency: debt.currency,
      interestRate: debt.interestRate,
      monthlyPayment: debt.monthlyPayment,
      startDate: debt.startDate,
      endDate: debt.endDate,
      color: debt.color,
      emoji: debt.emoji,
      notes: debt.notes,
    });
    const debtId = rememberId(context, `debt:${debt.key}`, created);
    for (const payment of debt.payments) {
      await owner.post('/api/debts/payments', { debtId, ...payment });
    }
  }
}

async function seedSalary(context: Context): Promise<void> {
  for (const employment of EMPLOYMENTS) {
    const owner = context.api[employment.owner];
    const created = await owner.post<Created>('/api/employments', {
      employerName: employment.employerName,
      employmentType: 'employed',
      serviceStartDate: employment.serviceStartDate,
      endDate: null,
      noticePeriodMonths: employment.noticePeriodMonths,
    });
    const employmentId = rememberId(context, `employment:${employment.key}`, created);
    for (const payslip of employment.payslips) {
      await owner.post('/api/salary/payslips', {
        employmentId,
        ...payslip,
        currency: employment.currency,
      });
    }
  }
  // The route stamps the clock; the household states when the employments were recorded.
  const recordedAt = new Date(HOUSEHOLD_TIMESTAMPS.employmentsRecordedAt);
  await db
    .update(employments)
    .set({ createdAt: recordedAt, updatedAt: recordedAt })
    .where(inArray(employments.userId, Object.values(context.userIds)));
}

function goalSource(context: Context, goal: GoalSpec) {
  if (!goal.savingsAccountKey) return {};
  return {
    sourceType: 'savings_account',
    sourceId: idOf(context, `savings:${goal.savingsAccountKey}`),
  };
}

/** A goal that follows a savings account starts at that account's balance. */
function goalCurrentAmount(goal: GoalSpec): number {
  if (goal.currentAmount !== 'account') return goal.currentAmount;
  const account = SAVINGS_ACCOUNTS.find((candidate) => candidate.key === goal.savingsAccountKey);
  if (!account) throw new Error(`Goal ${goal.name} follows an account that does not exist`);
  return expectedSavingsBalance(account);
}

function goalHabit(goal: GoalSpec) {
  return {
    monthlyTarget: goal.habit?.monthlyTarget ?? null,
    monthsCompleted: goal.habit?.monthsCompleted ?? null,
    totalMonths: goal.habit?.totalMonths ?? null,
    unit: goal.habit?.unit ?? null,
  };
}

async function seedGoals(context: Context): Promise<void> {
  for (const goal of GOALS) {
    await context.api.demo.post('/api/goals', {
      type: goal.type,
      ...goalSource(context, goal),
      ...goalHabit(goal),
      name: goal.name,
      emoji: goal.emoji,
      currentAmount: goalCurrentAmount(goal),
      targetAmount: goal.targetAmount,
      deadline: goal.deadline,
      year: goal.year,
      category: goal.category,
      monthlyContribution: goal.monthlyContribution,
      color: goal.color,
      notes: goal.notes,
      currency: goal.currency,
      startMonth: goal.startMonth,
      missedMonths: goal.missedMonths,
    });
  }
}

async function seedBudget(context: Context): Promise<void> {
  const demo = context.api.demo;
  for (const month of BUDGET_MONTHS) {
    for (const category of BUDGET_CATEGORIES) {
      if (!budgetCategoryMonths(category).includes(month)) continue;
      const preset = CATEGORY_PRESETS[category.name]!;
      const created = await demo.post<Created>('/api/budget/categories', {
        name: category.name,
        emoji: preset.emoji,
        budgeted: category.budgeted,
        spent: 0,
        color: preset.color,
        month: month.month,
        year: month.year,
      });
      rememberId(context, `budget:${category.name}:${month.month}:${month.year}`, created);
    }
  }
  for (const transaction of budgetTransactions()) {
    await demo.post('/api/budget/transactions', {
      categoryId: idOf(
        context,
        `budget:${transaction.categoryName}:${transaction.month}:${transaction.year}`,
      ),
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      merchant: transaction.merchant,
      currency: transaction.currency,
    });
  }
}

/** The pages' own reads must answer for both partners; a failure here means the data is unusable. */
async function verifyHousehold(context: Context): Promise<void> {
  for (const member of ['demo', 'partner'] as const) {
    const api = context.api[member];
    const summary = await api.get<{ netWorth: { isEstimated: boolean }[] }>(
      '/api/dashboard/summary',
    );
    await api.get('/api/dashboard/allocations');
    const runway = await api.get<{ depositGuarantee: { confidence: string }[] }>(
      '/api/plan/runway',
    );
    // The chart rests on stored rates and prices, and no bank waits for review.
    if (summary.netWorth.some((point) => point.isEstimated)) {
      throw new Error(`The seeded net worth history of the ${member} user is marked estimated`);
    }
    if (runway.depositGuarantee.some((entry) => entry.confidence !== 'verified')) {
      throw new Error(`A bank of the ${member} user still needs entity review`);
    }
  }
}

export type HouseholdSeedSummary = { requests: number };

async function writeHousehold(
  userIds: Record<Member, number>,
  partnerEmail: string,
): Promise<HouseholdSeedSummary> {
  await resetHousehold(Object.values(userIds));
  const app = createApp();
  const api = {
    demo: await openHouseholdApi(userIds.demo, app),
    partner: await openHouseholdApi(userIds.partner, app),
  };
  const context: Context = { api, userIds, ids: new Map() };
  try {
    await linkPartners(context, partnerEmail);
    await seedRateHistory();
    await seedSavings(context);
    await confirmBankingEntities(context);
    await seedHoldings(context);
    await seedProperties(context);
    await seedMortgage(context);
    await seedPropertyLedgers(context);
    await seedPensions(context);
    await seedDebts(context);
    await seedSalary(context);
    await seedGoals(context);
    await seedBudget(context);
    await verifyHousehold(context);
    return { requests: api.demo.requests + api.partner.requests };
  } finally {
    await Promise.all([api.demo.close(), api.partner.close()]);
  }
}

/**
 * Resets and seeds the household for two existing demo users. Refuses, writing nothing, when the
 * database holds any other user. Runs as a write under the maintenance lock, so a backup or a
 * restore in progress stops it.
 */
export async function seedHousehold(
  userIds: Record<Member, number>,
  partnerEmail: string,
): Promise<HouseholdSeedSummary> {
  await assertOnlyDemoUsers();
  const outcome = await runUnlessMaintenance(() => writeHousehold(userIds, partnerEmail));
  if (!outcome.ran) {
    throw new Error('Quro is being backed up or restored, so the household was not seeded.');
  }
  return outcome.value;
}
