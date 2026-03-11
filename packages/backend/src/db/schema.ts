import {
  pgTable,
  pgEnum,
  serial,
  text,
  date,
  numeric,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  check,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const CURRENCY_CODES = ['EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'SGD'] as const;
export const currencyCodeEnum = pgEnum('currency_code', CURRENCY_CODES);
export const pensionImportStatusEnum = pgEnum('pension_import_status', [
  'queued',
  'processing',
  'ready_for_review',
  'failed',
  'committed',
  'expired',
  'cancelled',
]);

export const pensionImportConfidenceLabelEnum = pgEnum('pension_import_confidence_label', [
  'high',
  'medium',
  'low',
]);

const inlinePdfDocumentColumns = () => ({
  documentStorageKey: text('document_storage_key'),
  documentFileName: text('document_file_name'),
  documentSizeBytes: integer('document_size_bytes'),
  documentUploadedAt: timestamp('document_uploaded_at'),
});

const inlinePdfDocumentStateCheck = (
  constraintName: string,
  table: {
    documentStorageKey: AnyPgColumn;
    documentFileName: AnyPgColumn;
    documentSizeBytes: AnyPgColumn;
    documentUploadedAt: AnyPgColumn;
  },
) =>
  check(
    constraintName,
    sql`((${table.documentStorageKey} is null and ${table.documentFileName} is null and ${table.documentSizeBytes} is null and ${table.documentUploadedAt} is null) or (${table.documentStorageKey} is not null and ${table.documentFileName} is not null and ${table.documentSizeBytes} is not null and ${table.documentUploadedAt} is not null))`,
  );

const inlinePdfDocumentSizeCheck = (
  constraintName: string,
  table: {
    documentStorageKey: AnyPgColumn;
    documentFileName: AnyPgColumn;
    documentSizeBytes: AnyPgColumn;
    documentUploadedAt: AnyPgColumn;
  },
) =>
  check(constraintName, sql`${table.documentSizeBytes} is null or ${table.documentSizeBytes} > 0`);

// ── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull().unique(),
    location: text('location').notNull().default(''),
    age: integer('age').notNull().default(35),
    retirementAge: integer('retirement_age').notNull().default(67),
    baseCurrency: currencyCodeEnum('base_currency').notNull().default('EUR'),
    passwordHash: text('password_hash').notNull(),
    passwordUpdatedAt: timestamp('password_updated_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    ageRangeCheck: check('users_age_range_check', sql`${table.age} between 16 and 100`),
    retirementAgeRangeCheck: check(
      'users_retirement_age_range_check',
      sql`${table.retirementAge} between 17 and 80`,
    ),
    retirementAfterAgeCheck: check(
      'users_retirement_after_age_check',
      sql`${table.retirementAge} > ${table.age}`,
    ),
  }),
);

// ── Sessions ────────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Worker Heartbeats ───────────────────────────────────────────────────────

export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerName: text('worker_name').primaryKey(),
  status: text('status').notNull(),
  lastHeartbeatAt: timestamp('last_heartbeat_at').notNull(),
  parserHealthy: boolean('parser_healthy').notNull().default(false),
  parserCheckedAt: timestamp('parser_checked_at'),
  parserError: text('parser_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Savings ──────────────────────────────────────────────────────────────────

export const savingsAccounts = pgTable(
  'savings_accounts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    name: text('name').notNull(),
    bank: text('bank').notNull(),
    balance: numeric('balance').notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    interestRate: numeric('interest_rate').notNull(),
    accountType: text('account_type').notNull(),
    color: text('color'),
    emoji: text('emoji'),
  },
  (table) => ({
    userIdx: index('savings_accounts_user_id_idx').on(table.userId),
  }),
);

export const savingsTransactions = pgTable(
  'savings_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    accountId: integer('account_id')
      .references(() => savingsAccounts.id)
      .notNull(),
    type: text('type').notNull(), // deposit | withdrawal | interest
    amount: numeric('amount').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
  },
  (table) => ({
    userIdx: index('savings_transactions_user_id_idx').on(table.userId),
    userDateIdx: index('savings_transactions_user_date_idx').on(table.userId, table.date),
  }),
);

// ── Stock Exchanges (reference data) ─────────────────────────────────────────

export const stockExchanges = pgTable('stock_exchanges', {
  id: serial('id').primaryKey(),
  mic: text('mic').notNull().unique(),
  name: text('name').notNull(),
  acronym: text('acronym'),
  country: text('country'),
  countryCode: text('country_code'),
  city: text('city'),
  website: text('website'),
});

// ── Holdings / Investments ───────────────────────────────────────────────────

export const holdings = pgTable(
  'holdings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    name: text('name').notNull(),
    ticker: text('ticker').notNull(),
    currentPrice: numeric('current_price').notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    sector: text('sector').notNull(),
    itemType: text('item_type'),
    exchangeMic: text('exchange_mic'),
    industry: text('industry'),
    priceUpdatedAt: timestamp('price_updated_at'),
  },
  (table) => ({
    userIdx: index('holdings_user_id_idx').on(table.userId),
  }),
);

export const holdingTransactions = pgTable(
  'holding_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    holdingId: integer('holding_id')
      .references(() => holdings.id)
      .notNull(),
    type: text('type').notNull(), // buy | sell | dividend
    shares: numeric('shares'),
    price: numeric('price').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
  },
  (table) => ({
    userIdx: index('holding_transactions_user_id_idx').on(table.userId),
    userDateIdx: index('holding_transactions_user_date_idx').on(table.userId, table.date),
  }),
);

export const holdingPriceHistory = pgTable(
  'holding_price_history',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    holdingId: integer('holding_id')
      .references(() => holdings.id, { onDelete: 'cascade' })
      .notNull(),
    eodDate: date('eod_date', { mode: 'string' }).notNull(),
    closePrice: numeric('close_price').notNull(),
    priceCurrency: text('price_currency').notNull(),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: index('holding_price_history_user_date_idx').on(table.userId, table.eodDate),
    holdingDateIdx: index('holding_price_history_holding_date_idx').on(
      table.holdingId,
      table.eodDate,
    ),
    holdingDateUnique: uniqueIndex('holding_price_history_holding_date_unique').on(
      table.holdingId,
      table.eodDate,
    ),
  }),
);

// ── Properties ───────────────────────────────────────────────────────────────

export const properties = pgTable(
  'properties',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    address: text('address').notNull(),
    propertyType: text('property_type').notNull(),
    purchasePrice: numeric('purchase_price').notNull(),
    currentValue: numeric('current_value').notNull(),
    mortgage: numeric('mortgage').notNull(),
    mortgageId: integer('mortgage_id'),
    monthlyRent: numeric('monthly_rent').notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    emoji: text('emoji'),
  },
  (table) => ({
    userIdx: index('properties_user_id_idx').on(table.userId),
    mortgageIdx: index('properties_mortgage_id_idx').on(table.mortgageId),
  }),
);

export const propertyTransactions = pgTable(
  'property_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    propertyId: integer('property_id')
      .references(() => properties.id)
      .notNull(),
    type: text('type').notNull(), // repayment | valuation | rent_income | expense
    amount: numeric('amount').notNull(),
    interest: numeric('interest'),
    principal: numeric('principal'),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
  },
  (table) => ({
    userIdx: index('property_transactions_user_id_idx').on(table.userId),
    userDateIdx: index('property_transactions_user_date_idx').on(table.userId, table.date),
  }),
);

// ── Pensions ─────────────────────────────────────────────────────────────────

export const pensionPots = pgTable(
  'pension_pots',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    type: text('type').notNull(),
    balance: numeric('balance').notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    employeeMonthly: numeric('employee_monthly').notNull(),
    employerMonthly: numeric('employer_monthly').notNull(),
    investmentStrategy: text('investment_strategy'),
    metadata: jsonb('metadata').$type<Record<string, string>>().notNull().default({}),
    color: text('color'),
    emoji: text('emoji'),
    notes: text('notes'),
  },
  (table) => ({
    userIdx: index('pension_pots_user_id_idx').on(table.userId),
  }),
);

export const pensionTransactions = pgTable(
  'pension_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    potId: integer('pot_id')
      .references(() => pensionPots.id)
      .notNull(),
    type: text('type').notNull(), // contribution | fee | annual_statement
    amount: numeric('amount').notNull(),
    taxAmount: numeric('tax_amount').notNull().default('0'),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
    isEmployer: boolean('is_employer'),
    ...inlinePdfDocumentColumns(),
  },
  (table) => ({
    userIdx: index('pension_transactions_user_id_idx').on(table.userId),
    userDateIdx: index('pension_transactions_user_date_idx').on(table.userId, table.date),
    documentStateChk: inlinePdfDocumentStateCheck(
      'pension_transactions_document_fields_chk',
      table,
    ),
    documentSizeChk: inlinePdfDocumentSizeCheck(
      'pension_transactions_document_size_bytes_chk',
      table,
    ),
  }),
);

export const pensionStatementImports = pgTable(
  'pension_statement_imports',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    potId: integer('pot_id')
      .references(() => pensionPots.id, { onDelete: 'cascade' })
      .notNull(),
    status: pensionImportStatusEnum('status').notNull().default('queued'),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    fileHashSha256: text('file_hash_sha256').notNull(),
    statementPeriodStart: date('statement_period_start', { mode: 'string' }),
    statementPeriodEnd: date('statement_period_end', { mode: 'string' }),
    languageHints: jsonb('language_hints').$type<string[]>().notNull().default([]),
    modelName: text('model_name'),
    modelVersion: text('model_version'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    committedAt: timestamp('committed_at'),
  },
  (table) => ({
    userStatusIdx: index('pension_statement_imports_user_status_idx').on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    potIdx: index('pension_statement_imports_pot_id_idx').on(table.potId),
    hashIdx: index('pension_statement_imports_hash_idx').on(table.fileHashSha256),
  }),
);

export const pensionStatementImportRows = pgTable(
  'pension_statement_import_rows',
  {
    id: serial('id').primaryKey(),
    importId: integer('import_id')
      .references(() => pensionStatementImports.id, { onDelete: 'cascade' })
      .notNull(),
    rowOrder: integer('row_order').notNull(),
    type: text('type').notNull(),
    amount: numeric('amount').notNull(),
    taxAmount: numeric('tax_amount').notNull().default('0'),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note').notNull().default(''),
    isEmployer: boolean('is_employer'),
    confidence: numeric('confidence').notNull().default('0'),
    confidenceLabel: pensionImportConfidenceLabelEnum('confidence_label').notNull().default('low'),
    evidence: jsonb('evidence')
      .$type<Array<{ page: number | null; snippet: string }>>()
      .notNull()
      .default([]),
    isDerived: boolean('is_derived').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    collisionWarning: jsonb('collision_warning').$type<{
      existingTransactionId: number;
      reason: string;
    } | null>(),
    committedTransactionId: integer('committed_transaction_id').references(
      () => pensionTransactions.id,
      {
        onDelete: 'set null',
      },
    ),
    editedAt: timestamp('edited_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    importOrderIdx: index('pension_statement_import_rows_import_order_idx').on(
      table.importId,
      table.rowOrder,
    ),
    importDeletedIdx: index('pension_statement_import_rows_import_deleted_idx').on(
      table.importId,
      table.isDeleted,
    ),
    committedTxnIdx: index('pension_statement_import_rows_committed_txn_idx').on(
      table.committedTransactionId,
    ),
  }),
);

// ── Mortgages ────────────────────────────────────────────────────────────────

export const mortgages = pgTable(
  'mortgages',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    propertyAddress: text('property_address').notNull(),
    lender: text('lender').notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    originalAmount: numeric('original_amount').notNull(),
    outstandingBalance: numeric('outstanding_balance').notNull(),
    propertyValue: numeric('property_value').notNull(),
    monthlyPayment: numeric('monthly_payment').notNull(),
    interestRate: numeric('interest_rate').notNull(),
    rateType: text('rate_type').notNull(),
    fixedUntil: text('fixed_until'),
    termYears: integer('term_years').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    overpaymentLimit: numeric('overpayment_limit'),
  },
  (table) => ({
    userIdx: index('mortgages_user_id_idx').on(table.userId),
  }),
);

export const mortgageTransactions = pgTable(
  'mortgage_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    mortgageId: integer('mortgage_id')
      .references(() => mortgages.id)
      .notNull(),
    type: text('type').notNull(), // repayment | valuation | rate_change
    amount: numeric('amount').notNull(),
    interest: numeric('interest'),
    principal: numeric('principal'),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
    fixedYears: numeric('fixed_years'),
  },
  (table) => ({
    userIdx: index('mortgage_transactions_user_id_idx').on(table.userId),
    userDateIdx: index('mortgage_transactions_user_date_idx').on(table.userId, table.date),
  }),
);

// ── Debts ────────────────────────────────────────────────────────────────────

export const debts = pgTable(
  'debts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    lender: text('lender').notNull(),
    originalAmount: numeric('original_amount').notNull(),
    remainingBalance: numeric('remaining_balance').notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    interestRate: numeric('interest_rate').notNull(),
    monthlyPayment: numeric('monthly_payment').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    color: text('color').notNull(),
    emoji: text('emoji').notNull(),
    notes: text('notes'),
  },
  (table) => ({
    userIdx: index('debts_user_id_idx').on(table.userId),
  }),
);

export const debtPayments = pgTable(
  'debt_payments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    debtId: integer('debt_id')
      .references(() => debts.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    amount: numeric('amount').notNull(),
    principal: numeric('principal').notNull(),
    interest: numeric('interest').notNull(),
    note: text('note'),
  },
  (table) => ({
    userIdx: index('debt_payments_user_id_idx').on(table.userId),
    userDateIdx: index('debt_payments_user_date_idx').on(table.userId, table.date),
    debtIdx: index('debt_payments_debt_id_idx').on(table.debtId),
  }),
);

// ── Salary ───────────────────────────────────────────────────────────────────

export const payslips = pgTable(
  'payslips',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    month: text('month').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    gross: numeric('gross').notNull(),
    tax: numeric('tax').notNull(),
    pension: numeric('pension').notNull(),
    net: numeric('net').notNull(),
    bonus: numeric('bonus'),
    currency: currencyCodeEnum('currency').default('EUR').notNull(),
    ...inlinePdfDocumentColumns(),
  },
  (table) => ({
    userIdx: index('payslips_user_id_idx').on(table.userId),
    userDateIdx: index('payslips_user_date_idx').on(table.userId, table.date),
    documentStateChk: inlinePdfDocumentStateCheck('payslips_document_fields_chk', table),
    documentSizeChk: inlinePdfDocumentSizeCheck('payslips_document_size_bytes_chk', table),
  }),
);

// ── Goals ────────────────────────────────────────────────────────────────────

export const goals = pgTable(
  'goals',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    type: text('type'),
    name: text('name').notNull(),
    emoji: text('emoji'),
    currentAmount: numeric('current_amount').notNull(),
    targetAmount: numeric('target_amount').notNull(),
    deadline: text('deadline').notNull(),
    year: integer('year'),
    category: text('category').notNull(),
    monthlyContribution: numeric('monthly_contribution').notNull(),
    monthlyTarget: numeric('monthly_target'),
    monthsCompleted: integer('months_completed'),
    totalMonths: integer('total_months'),
    unit: text('unit'),
    color: text('color'),
    notes: text('notes'),
    currency: currencyCodeEnum('currency').default('EUR').notNull(),
  },
  (table) => ({
    userIdx: index('goals_user_id_idx').on(table.userId),
  }),
);

// ── Budget ───────────────────────────────────────────────────────────────────

export const budgetCategories = pgTable(
  'budget_categories',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    name: text('name').notNull(),
    emoji: text('emoji'),
    budgeted: numeric('budgeted').notNull(),
    spent: numeric('spent').notNull(),
    color: text('color'),
    month: text('month').notNull(),
    year: integer('year').notNull(),
  },
  (table) => ({
    userIdx: index('budget_categories_user_id_idx').on(table.userId),
  }),
);

export const budgetTransactions = pgTable(
  'budget_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    categoryId: integer('category_id')
      .references(() => budgetCategories.id)
      .notNull(),
    description: text('description').notNull(),
    amount: numeric('amount').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    merchant: text('merchant').notNull(),
  },
  (table) => ({
    userIdx: index('budget_transactions_user_id_idx').on(table.userId),
    userDateIdx: index('budget_transactions_user_date_idx').on(table.userId, table.date),
  }),
);

// ── Currency ─────────────────────────────────────────────────────────────────

export const currencyRates = pgTable('currency_rates', {
  id: serial('id').primaryKey(),
  fromCurrency: currencyCodeEnum('from_currency').notNull(),
  toCurrency: currencyCodeEnum('to_currency').notNull(),
  rate: numeric('rate').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardTransactions = pgTable(
  'dashboard_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    name: text('name').notNull(),
    type: text('type').notNull(),
    amount: numeric('amount').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    category: text('category').notNull(),
  },
  (table) => ({
    userIdx: index('dashboard_transactions_user_id_idx').on(table.userId),
    userDateIdx: index('dashboard_transactions_user_date_idx').on(table.userId, table.date),
  }),
);
