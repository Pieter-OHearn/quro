import { pgTable, serial, text, numeric, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

// ── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Sessions ────────────────────────────────────────────────────────────────

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Savings ──────────────────────────────────────────────────────────────────

export const savingsAccounts = pgTable("savings_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  bank: text("bank").notNull(),
  balance: numeric("balance").notNull(),
  currency: text("currency").notNull(),
  interestRate: numeric("interest_rate").notNull(),
  accountType: text("account_type").notNull(),
  color: text("color"),
  emoji: text("emoji"),
}, (table) => ({
  userIdx: index("savings_accounts_user_id_idx").on(table.userId),
}));

export const savingsTransactions = pgTable("savings_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  accountId: integer("account_id").references(() => savingsAccounts.id).notNull(),
  type: text("type").notNull(), // deposit | withdrawal | interest
  amount: numeric("amount").notNull(),
  date: text("date").notNull(),
  note: text("note"),
}, (table) => ({
  userIdx: index("savings_transactions_user_id_idx").on(table.userId),
  userDateIdx: index("savings_transactions_user_date_idx").on(table.userId, table.date),
}));

// ── Holdings / Investments ───────────────────────────────────────────────────

export const holdings = pgTable("holdings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  currentPrice: numeric("current_price").notNull(),
  currency: text("currency").notNull(),
  sector: text("sector").notNull(),
}, (table) => ({
  userIdx: index("holdings_user_id_idx").on(table.userId),
}));

export const holdingTransactions = pgTable("holding_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  holdingId: integer("holding_id").references(() => holdings.id).notNull(),
  type: text("type").notNull(), // buy | sell | dividend
  shares: numeric("shares"),
  price: numeric("price").notNull(),
  date: text("date").notNull(),
  note: text("note"),
}, (table) => ({
  userIdx: index("holding_transactions_user_id_idx").on(table.userId),
  userDateIdx: index("holding_transactions_user_date_idx").on(table.userId, table.date),
}));

// ── Properties ───────────────────────────────────────────────────────────────

export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  address: text("address").notNull(),
  propertyType: text("property_type").notNull(),
  purchasePrice: numeric("purchase_price").notNull(),
  currentValue: numeric("current_value").notNull(),
  mortgage: numeric("mortgage").notNull(),
  mortgageId: integer("mortgage_id"),
  monthlyRent: numeric("monthly_rent").notNull(),
  currency: text("currency").notNull(),
  emoji: text("emoji"),
}, (table) => ({
  userIdx: index("properties_user_id_idx").on(table.userId),
  mortgageIdx: index("properties_mortgage_id_idx").on(table.mortgageId),
}));

export const propertyTransactions = pgTable("property_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  propertyId: integer("property_id").references(() => properties.id).notNull(),
  type: text("type").notNull(), // repayment | valuation | rent_income | expense
  amount: numeric("amount").notNull(),
  interest: numeric("interest"),
  principal: numeric("principal"),
  date: text("date").notNull(),
  note: text("note"),
}, (table) => ({
  userIdx: index("property_transactions_user_id_idx").on(table.userId),
  userDateIdx: index("property_transactions_user_date_idx").on(table.userId, table.date),
}));

// ── Pensions ─────────────────────────────────────────────────────────────────

export const pensionPots = pgTable("pension_pots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  balance: numeric("balance").notNull(),
  currency: text("currency").notNull(),
  employeeMonthly: numeric("employee_monthly").notNull(),
  employerMonthly: numeric("employer_monthly").notNull(),
  color: text("color"),
  emoji: text("emoji"),
  notes: text("notes"),
}, (table) => ({
  userIdx: index("pension_pots_user_id_idx").on(table.userId),
}));

export const pensionTransactions = pgTable("pension_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  potId: integer("pot_id").references(() => pensionPots.id).notNull(),
  type: text("type").notNull(), // contribution | fee
  amount: numeric("amount").notNull(),
  date: text("date").notNull(),
  note: text("note"),
  isEmployer: boolean("is_employer"),
}, (table) => ({
  userIdx: index("pension_transactions_user_id_idx").on(table.userId),
  userDateIdx: index("pension_transactions_user_date_idx").on(table.userId, table.date),
}));

// ── Mortgages ────────────────────────────────────────────────────────────────

export const mortgages = pgTable("mortgages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  propertyAddress: text("property_address").notNull(),
  lender: text("lender").notNull(),
  currency: text("currency").notNull(),
  originalAmount: numeric("original_amount").notNull(),
  outstandingBalance: numeric("outstanding_balance").notNull(),
  propertyValue: numeric("property_value").notNull(),
  monthlyPayment: numeric("monthly_payment").notNull(),
  interestRate: numeric("interest_rate").notNull(),
  rateType: text("rate_type").notNull(),
  fixedUntil: text("fixed_until"),
  termYears: integer("term_years").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  overpaymentLimit: numeric("overpayment_limit"),
}, (table) => ({
  userIdx: index("mortgages_user_id_idx").on(table.userId),
}));

export const mortgageTransactions = pgTable("mortgage_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  mortgageId: integer("mortgage_id").references(() => mortgages.id).notNull(),
  type: text("type").notNull(), // repayment | valuation | rate_change
  amount: numeric("amount").notNull(),
  interest: numeric("interest"),
  principal: numeric("principal"),
  date: text("date").notNull(),
  note: text("note"),
  fixedYears: numeric("fixed_years"),
}, (table) => ({
  userIdx: index("mortgage_transactions_user_id_idx").on(table.userId),
  userDateIdx: index("mortgage_transactions_user_date_idx").on(table.userId, table.date),
}));

// ── Salary ───────────────────────────────────────────────────────────────────

export const payslips = pgTable("payslips", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  month: text("month").notNull(),
  date: text("date").notNull(),
  gross: numeric("gross").notNull(),
  tax: numeric("tax").notNull(),
  pension: numeric("pension").notNull(),
  net: numeric("net").notNull(),
  bonus: numeric("bonus"),
  currency: text("currency").default("EUR").notNull(),
}, (table) => ({
  userIdx: index("payslips_user_id_idx").on(table.userId),
  userDateIdx: index("payslips_user_date_idx").on(table.userId, table.date),
}));

export const salaryHistory = pgTable("salary_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  year: integer("year").notNull(),
  annualSalary: numeric("annual_salary").notNull(),
  currency: text("currency").default("EUR").notNull(),
}, (table) => ({
  userIdx: index("salary_history_user_id_idx").on(table.userId),
}));

// ── Goals ────────────────────────────────────────────────────────────────────

export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  type: text("type"),
  name: text("name").notNull(),
  emoji: text("emoji"),
  currentAmount: numeric("current_amount").notNull(),
  targetAmount: numeric("target_amount").notNull(),
  deadline: text("deadline").notNull(),
  year: integer("year"),
  category: text("category").notNull(),
  monthlyContribution: numeric("monthly_contribution").notNull(),
  monthlyTarget: numeric("monthly_target"),
  monthsCompleted: integer("months_completed"),
  totalMonths: integer("total_months"),
  unit: text("unit"),
  color: text("color"),
  notes: text("notes"),
  currency: text("currency").default("EUR").notNull(),
}, (table) => ({
  userIdx: index("goals_user_id_idx").on(table.userId),
}));

// ── Budget ───────────────────────────────────────────────────────────────────

export const budgetCategories = pgTable("budget_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  emoji: text("emoji"),
  budgeted: numeric("budgeted").notNull(),
  spent: numeric("spent").notNull(),
  color: text("color"),
  month: text("month").notNull(),
  year: integer("year").notNull(),
}, (table) => ({
  userIdx: index("budget_categories_user_id_idx").on(table.userId),
}));

export const budgetTransactions = pgTable("budget_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  categoryId: integer("category_id").references(() => budgetCategories.id).notNull(),
  description: text("description").notNull(),
  amount: numeric("amount").notNull(),
  date: text("date").notNull(),
  merchant: text("merchant").notNull(),
}, (table) => ({
  userIdx: index("budget_transactions_user_id_idx").on(table.userId),
  userDateIdx: index("budget_transactions_user_date_idx").on(table.userId, table.date),
}));

// ── Net Worth ────────────────────────────────────────────────────────────────

export const netWorthSnapshots = pgTable("net_worth_snapshots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  totalValue: numeric("total_value").notNull(),
  currency: text("currency").default("EUR").notNull(),
}, (table) => ({
  userIdx: index("net_worth_snapshots_user_id_idx").on(table.userId),
}));

export const assetAllocations = pgTable("asset_allocations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  value: numeric("value").notNull(),
  color: text("color"),
  snapshotId: integer("snapshot_id").references(() => netWorthSnapshots.id).notNull(),
}, (table) => ({
  userIdx: index("asset_allocations_user_id_idx").on(table.userId),
}));

// ── Currency ─────────────────────────────────────────────────────────────────

export const currencyRates = pgTable("currency_rates", {
  id: serial("id").primaryKey(),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  rate: numeric("rate").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardTransactions = pgTable("dashboard_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  amount: numeric("amount").notNull(),
  date: text("date").notNull(),
  category: text("category").notNull(),
}, (table) => ({
  userIdx: index("dashboard_transactions_user_id_idx").on(table.userId),
  userDateIdx: index("dashboard_transactions_user_date_idx").on(table.userId, table.date),
}));
