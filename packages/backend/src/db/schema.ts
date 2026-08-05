import {
  pgTable,
  pgEnum,
  serial,
  text,
  date,
  customType,
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
import {
  CURRENCY_CODES,
  MAX_RETIREMENT_AGE,
  MAX_USER_AGE,
  MIN_RETIREMENT_AGE,
  MIN_USER_AGE,
} from '@quro/shared';

export const currencyCodeEnum = pgEnum('currency_code', CURRENCY_CODES);

const numericAsNumber = customType<{
  data: number;
  driverData: string;
  config: { precision?: number; scale?: number };
}>({
  dataType(config) {
    if (config?.precision !== undefined && config.scale !== undefined) {
      return `numeric(${config.precision}, ${config.scale})`;
    }

    return 'numeric';
  },
  fromDriver(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  },
  toDriver(value) {
    return String(value);
  },
});

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
export const bunqSyncStatusEnum = pgEnum('bunq_sync_status', ['idle', 'syncing', 'error']);
export const partnerLinkStatusEnum = pgEnum('partner_link_status', ['pending', 'accepted']);

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
    numberFormat: text('number_format').notNull().default('en-US'),
    passwordHash: text('password_hash').notNull(),
    passwordUpdatedAt: timestamp('password_updated_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    ageRangeCheck: check(
      'users_age_range_check',
      sql`${table.age} between ${sql.raw(String(MIN_USER_AGE))} and ${sql.raw(String(MAX_USER_AGE))}`,
    ),
    retirementAgeRangeCheck: check(
      'users_retirement_age_range_check',
      sql`${table.retirementAge} between ${sql.raw(String(MIN_RETIREMENT_AGE))} and ${sql.raw(
        String(MAX_RETIREMENT_AGE),
      )}`,
    ),
    retirementAfterAgeCheck: check(
      'users_retirement_after_age_check',
      sql`${table.retirementAge} > ${table.age}`,
    ),
    numberFormatCheck: check(
      'users_number_format_check',
      sql`${table.numberFormat} in ('en-US', 'de-DE')`,
    ),
  }),
);

// ── Sessions ────────────────────────────────────────────────────────────────

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('sessions_user_id_idx').on(table.userId),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
  }),
);

// ── Partner Links ────────────────────────────────────────────────────────────

export const partnerLinks = pgTable(
  'partner_links',
  {
    id: serial('id').primaryKey(),
    requesterId: integer('requester_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    addresseeId: integer('addressee_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: partnerLinkStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    respondedAt: timestamp('responded_at'),
  },
  (table) => ({
    requesterUnique: uniqueIndex('partner_links_requester_id_unique').on(table.requesterId),
    addresseeUnique: uniqueIndex('partner_links_addressee_id_unique').on(table.addresseeId),
    noSelfLinkCheck: check(
      'partner_links_no_self_link_check',
      sql`${table.requesterId} <> ${table.addresseeId}`,
    ),
  }),
);

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
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    name: text('name').notNull(),
    bank: text('bank').notNull(),
    balance: numericAsNumber('balance', { precision: 19, scale: 2 }).notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    interestRate: numericAsNumber('interest_rate', { precision: 7, scale: 4 }).notNull(),
    accountType: text('account_type').notNull(),
    color: text('color'),
    emoji: text('emoji'),
    bunqAccountId: text('bunq_account_id'),
    isJoint: boolean('is_joint').notNull().default(false),
    archivedAt: timestamp('archived_at'),
  },
  (table) => ({
    userIdx: index('savings_accounts_user_id_idx').on(table.userId),
    bunqAccountUnique: uniqueIndex('savings_accounts_user_bunq_account_id_unique').on(
      table.userId,
      table.bunqAccountId,
    ),
  }),
);

export const savingsTransactions = pgTable(
  'savings_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    accountId: integer('account_id')
      .references(() => savingsAccounts.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // deposit | withdrawal | interest
    amount: numericAsNumber('amount', { precision: 19, scale: 2 }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
    bunqTransactionId: text('bunq_transaction_id'),
  },
  (table) => ({
    userIdx: index('savings_transactions_user_id_idx').on(table.userId),
    accountIdx: index('savings_transactions_account_id_idx').on(table.accountId),
    userDateIdx: index('savings_transactions_user_date_idx').on(table.userId, table.date),
    bunqTransactionUnique: uniqueIndex('savings_transactions_user_bunq_transaction_id_unique').on(
      table.userId,
      table.bunqTransactionId,
    ),
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
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    name: text('name').notNull(),
    ticker: text('ticker').notNull(),
    currentPrice: numericAsNumber('current_price', { precision: 19, scale: 2 }).notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    sector: text('sector').notNull(),
    itemType: text('item_type'),
    exchangeMic: text('exchange_mic'),
    industry: text('industry'),
    priceUpdatedAt: timestamp('price_updated_at'),
    manualPrice: numericAsNumber('manual_price', { precision: 19, scale: 2 }),
    excludeFromSync: boolean('exclude_from_sync').default(false).notNull(),
    archivedAt: timestamp('archived_at'),
  },
  (table) => ({
    userIdx: index('holdings_user_id_idx').on(table.userId),
  }),
);

export const holdingTransactions = pgTable(
  'holding_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    holdingId: integer('holding_id')
      .references(() => holdings.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // buy | sell | dividend
    shares: numericAsNumber('shares', { precision: 19, scale: 6 }),
    price: numericAsNumber('price', { precision: 19, scale: 2 }).notNull(),
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
    closePrice: numericAsNumber('close_price', { precision: 19, scale: 2 }).notNull(),
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
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    address: text('address').notNull(),
    propertyType: text('property_type').notNull(),
    purchasePrice: numericAsNumber('purchase_price', { precision: 19, scale: 2 }).notNull(),
    currentValue: numericAsNumber('current_value', { precision: 19, scale: 2 }).notNull(),
    mortgage: numericAsNumber('mortgage', { precision: 19, scale: 2 }).notNull(),
    mortgageId: integer('mortgage_id').references(() => mortgages.id, { onDelete: 'set null' }),
    monthlyRent: numericAsNumber('monthly_rent', { precision: 19, scale: 2 }).notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    emoji: text('emoji'),
    isJoint: boolean('is_joint').notNull().default(false),
    archivedAt: timestamp('archived_at'),
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
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    propertyId: integer('property_id')
      .references(() => properties.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // repayment | valuation | rent_income | expense
    amount: numericAsNumber('amount', { precision: 19, scale: 2 }).notNull(),
    interest: numericAsNumber('interest', { precision: 19, scale: 2 }),
    principal: numericAsNumber('principal', { precision: 19, scale: 2 }),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
  },
  (table) => ({
    userIdx: index('property_transactions_user_id_idx').on(table.userId),
    propertyIdx: index('property_transactions_property_id_idx').on(table.propertyId),
    userDateIdx: index('property_transactions_user_date_idx').on(table.userId, table.date),
  }),
);

// ── Pensions ─────────────────────────────────────────────────────────────────

export const pensionPots = pgTable(
  'pension_pots',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    type: text('type').notNull(),
    balance: numericAsNumber('balance', { precision: 19, scale: 2 }).notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    employeeMonthly: numericAsNumber('employee_monthly', { precision: 19, scale: 2 }).notNull(),
    employerMonthly: numericAsNumber('employer_monthly', { precision: 19, scale: 2 }).notNull(),
    investmentStrategy: text('investment_strategy'),
    metadata: jsonb('metadata').$type<Record<string, string>>().notNull().default({}),
    color: text('color'),
    emoji: text('emoji'),
    notes: text('notes'),
    archivedAt: timestamp('archived_at'),
  },
  (table) => ({
    userIdx: index('pension_pots_user_id_idx').on(table.userId),
  }),
);

export const pensionTransactions = pgTable(
  'pension_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    potId: integer('pot_id')
      .references(() => pensionPots.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // contribution | fee | annual_statement
    amount: numericAsNumber('amount', { precision: 19, scale: 2 }).notNull(),
    taxAmount: numericAsNumber('tax_amount', { precision: 19, scale: 2 }).notNull().default(0),
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
    amount: numericAsNumber('amount', { precision: 19, scale: 2 }).notNull(),
    taxAmount: numericAsNumber('tax_amount', { precision: 19, scale: 2 }).notNull().default(0),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note').notNull().default(''),
    isEmployer: boolean('is_employer'),
    confidence: numericAsNumber('confidence', { precision: 5, scale: 4 }).notNull().default(0),
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
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    propertyAddress: text('property_address').notNull(),
    lender: text('lender').notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    originalAmount: numericAsNumber('original_amount', { precision: 19, scale: 2 }).notNull(),
    outstandingBalance: numericAsNumber('outstanding_balance', {
      precision: 19,
      scale: 2,
    }).notNull(),
    propertyValue: numericAsNumber('property_value', { precision: 19, scale: 2 }).notNull(),
    monthlyPayment: numericAsNumber('monthly_payment', { precision: 19, scale: 2 }).notNull(),
    interestRate: numericAsNumber('interest_rate', { precision: 7, scale: 4 }).notNull(),
    rateType: text('rate_type').notNull(),
    repaymentType: text('repayment_type').notNull().default('Annuity'),
    fixedUntil: text('fixed_until'),
    termYears: integer('term_years').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    overpaymentLimit: numericAsNumber('overpayment_limit', { precision: 19, scale: 2 }),
    isJoint: boolean('is_joint').notNull().default(false),
    archivedAt: timestamp('archived_at'),
  },
  (table) => ({
    userIdx: index('mortgages_user_id_idx').on(table.userId),
  }),
);

export const mortgageTransactions = pgTable(
  'mortgage_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    mortgageId: integer('mortgage_id')
      .references(() => mortgages.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(), // repayment | valuation | rate_change
    amount: numericAsNumber('amount', { precision: 19, scale: 2 }).notNull(),
    interest: numericAsNumber('interest', { precision: 19, scale: 2 }),
    principal: numericAsNumber('principal', { precision: 19, scale: 2 }),
    date: date('date', { mode: 'string' }).notNull(),
    note: text('note'),
    fixedYears: numericAsNumber('fixed_years', { precision: 4, scale: 1 }),
  },
  (table) => ({
    userIdx: index('mortgage_transactions_user_id_idx').on(table.userId),
    mortgageIdx: index('mortgage_transactions_mortgage_id_idx').on(table.mortgageId),
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
    originalAmount: numericAsNumber('original_amount', { precision: 19, scale: 2 }).notNull(),
    remainingBalance: numericAsNumber('remaining_balance', { precision: 19, scale: 2 }).notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    interestRate: numericAsNumber('interest_rate', { precision: 7, scale: 4 }).notNull(),
    monthlyPayment: numericAsNumber('monthly_payment', { precision: 19, scale: 2 }).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    color: text('color').notNull(),
    emoji: text('emoji').notNull(),
    notes: text('notes'),
    archivedAt: timestamp('archived_at'),
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
    amount: numericAsNumber('amount', { precision: 19, scale: 2 }).notNull(),
    principal: numericAsNumber('principal', { precision: 19, scale: 2 }).notNull(),
    interest: numericAsNumber('interest', { precision: 19, scale: 2 }).notNull(),
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
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    month: text('month').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    gross: numericAsNumber('gross', { precision: 19, scale: 2 }).notNull(),
    tax: numericAsNumber('tax', { precision: 19, scale: 2 }).notNull(),
    pension: numericAsNumber('pension', { precision: 19, scale: 2 }).notNull(),
    net: numericAsNumber('net', { precision: 19, scale: 2 }).notNull(),
    bonus: numericAsNumber('bonus', { precision: 19, scale: 2 }),
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
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    type: text('type'),
    sourceType: text('source_type').notNull().default('manual'),
    sourceId: integer('source_id'),
    name: text('name').notNull(),
    emoji: text('emoji'),
    currentAmount: numericAsNumber('current_amount', { precision: 19, scale: 2 }).notNull(),
    targetAmount: numericAsNumber('target_amount', { precision: 19, scale: 2 }).notNull(),
    deadline: text('deadline').notNull(),
    year: integer('year'),
    category: text('category').notNull(),
    monthlyContribution: numericAsNumber('monthly_contribution', {
      precision: 19,
      scale: 2,
    }).notNull(),
    monthlyTarget: numericAsNumber('monthly_target', { precision: 19, scale: 2 }),
    monthsCompleted: integer('months_completed'),
    totalMonths: integer('total_months'),
    unit: text('unit'),
    color: text('color'),
    notes: text('notes'),
    currency: currencyCodeEnum('currency').default('EUR').notNull(),
    startMonth: text('start_month'),
    missedMonths: jsonb('missed_months').$type<string[]>(),
  },
  (table) => ({
    userIdx: index('goals_user_id_idx').on(table.userId),
    sourceIdx: index('goals_source_idx').on(table.sourceType, table.sourceId),
    sourceTypeCheck: check(
      'goals_source_type_check',
      sql`${table.sourceType} in ('manual', 'salary_latest_gross', 'savings_account', 'portfolio_total', 'net_worth_total', 'invest_habit_buys')`,
    ),
    sourceIdCheck: check(
      'goals_source_id_check',
      sql`((${table.sourceType} = 'savings_account' and ${table.sourceId} is not null and ${table.sourceId} > 0) or (${table.sourceType} <> 'savings_account' and ${table.sourceId} is null))`,
    ),
  }),
);

// ── Budget ───────────────────────────────────────────────────────────────────

export const budgetCategories = pgTable(
  'budget_categories',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    budgeted: numericAsNumber('budgeted', { precision: 19, scale: 2 }).notNull(),
    spent: numericAsNumber('spent', { precision: 19, scale: 2 }).notNull(),
    color: text('color'),
    month: text('month').notNull(),
    year: integer('year').notNull(),
  },
  (table) => ({
    userIdx: index('budget_categories_user_id_idx').on(table.userId),
    userMonthNameUnique: uniqueIndex('budget_categories_user_month_name_unique').on(
      table.userId,
      table.month,
      table.year,
      table.name,
    ),
  }),
);

export const budgetTransactions = pgTable(
  'budget_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    categoryId: integer('category_id')
      .references(() => budgetCategories.id)
      .notNull(),
    description: text('description').notNull(),
    amount: numericAsNumber('amount', { precision: 19, scale: 2 }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    merchant: text('merchant').notNull(),
    bunqTransactionId: text('bunq_transaction_id'),
    bunqMcc: text('bunq_mcc'),
    bunqPaymentType: text('bunq_payment_type'),
    sourceProvider: text('source_provider'),
    sourceAccountId: text('source_account_id'),
    sourceAccountName: text('source_account_name'),
    sourceAccountType: text('source_account_type'),
    counterpartyIban: text('counterparty_iban'),
  },
  (table) => ({
    userIdx: index('budget_transactions_user_id_idx').on(table.userId),
    userDateIdx: index('budget_transactions_user_date_idx').on(table.userId, table.date),
    bunqTransactionUnique: uniqueIndex('budget_transactions_user_bunq_transaction_id_unique').on(
      table.userId,
      table.bunqTransactionId,
    ),
  }),
);

export const categoryMappings = pgTable(
  'category_mappings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    source: text('source').notNull(),
    sourceKey: text('source_key').notNull(),
    categoryName: text('category_name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('category_mappings_user_id_idx').on(table.userId),
    userSourceKeyUnique: uniqueIndex('category_mappings_user_source_key_unique').on(
      table.userId,
      table.source,
      table.sourceKey,
    ),
  }),
);

// ── Currency ─────────────────────────────────────────────────────────────────

export const currencyRates = pgTable(
  'currency_rates',
  {
    id: serial('id').primaryKey(),
    fromCurrency: currencyCodeEnum('from_currency').notNull(),
    toCurrency: currencyCodeEnum('to_currency').notNull(),
    rate: numericAsNumber('rate', { precision: 12, scale: 6 }).notNull(),
    provider: text('provider').notNull(),
    sourceDate: date('source_date', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    fromToUnique: uniqueIndex('currency_rates_from_to_unique').on(
      table.fromCurrency,
      table.toCurrency,
    ),
  }),
);

// ── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardTransactions = pgTable(
  'dashboard_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    amount: numericAsNumber('amount', { precision: 19, scale: 2 }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    category: text('category').notNull(),
  },
  (table) => ({
    userIdx: index('dashboard_transactions_user_id_idx').on(table.userId),
    userDateIdx: index('dashboard_transactions_user_date_idx').on(table.userId, table.date),
  }),
);

// ── Bunq ─────────────────────────────────────────────────────────────────────

export const bunqConnections = pgTable(
  'bunq_connections',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    accessToken: text('access_token').notNull(),
    privateKey: text('private_key'),
    installationToken: text('installation_token'),
    serverPublicKey: text('server_public_key'),
    sessionToken: text('session_token'),
    sessionId: integer('session_id'),
    sessionExpiresAt: timestamp('session_expires_at'),
    bunqUserId: text('bunq_user_id'),
    lastSyncAt: timestamp('last_sync_at'),
    syncStatus: bunqSyncStatusEnum('sync_status').notNull().default('idle'),
    syncError: text('sync_error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({ userIdx: uniqueIndex('bunq_connections_user_id_idx').on(t.userId) }),
);
