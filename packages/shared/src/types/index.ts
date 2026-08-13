import type { JurisdictionCode } from './jurisdiction.js';

export * from './jurisdiction.js';

export const CURRENCY_CODES = ['EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'SGD'] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const NUMBER_FORMATS = ['en-US', 'de-DE'] as const;

export type NumberFormatPreference = (typeof NUMBER_FORMATS)[number];

export const DEFAULT_NUMBER_FORMAT: NumberFormatPreference = 'en-US';

export const MIN_PASSWORD_LENGTH = 8;
export const MIN_USER_AGE = 16;
export const MAX_USER_AGE = 100;
export const MIN_RETIREMENT_AGE = 17;
export const MAX_RETIREMENT_AGE = 80;

export const BUDGET_MONTHS = [
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

export type BudgetMonth = (typeof BUDGET_MONTHS)[number];

const NUMBER_FORMAT_SET = new Set<string>(NUMBER_FORMATS);
const BUDGET_MONTH_SET = new Set<string>(BUDGET_MONTHS);

export function isNumberFormatPreference(value: unknown): value is NumberFormatPreference {
  return typeof value === 'string' && NUMBER_FORMAT_SET.has(value);
}

export function isBudgetMonth(value: unknown): value is BudgetMonth {
  return typeof value === 'string' && BUDGET_MONTH_SET.has(value);
}

export function toBudgetMonthIndex(month: BudgetMonth): number {
  return BUDGET_MONTHS.indexOf(month);
}

export function formatBudgetMonthFromDate(date: Date): BudgetMonth {
  return BUDGET_MONTHS[date.getMonth()] ?? BUDGET_MONTHS[0];
}

export type User = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  location: string;
  age: number;
  retirementAge: number;
  baseCurrency: CurrencyCode;
  jurisdiction: import('./jurisdiction.js').JurisdictionCode;
  numberFormat: NumberFormatPreference;
  passwordUpdatedAt: string | null;
  createdAt: string;
};

export type UpdateUserProfileInput = {
  firstName: string;
  lastName: string;
  email: string;
  location: string;
  age: number;
  retirementAge: number;
};

export type UpdateUserPreferencesInput = {
  baseCurrency?: CurrencyCode;
  numberFormat?: NumberFormatPreference;
  jurisdiction?: import('./jurisdiction.js').JurisdictionCode;
};

export type UpdateUserPasswordInput = {
  currentPassword: string;
  nextPassword: string;
};

export type PartnerLinkStatus = 'pending' | 'accepted';
export type PartnerLinkRole = 'requester' | 'addressee';

export type PartnerProfile = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
};

export type PartnerLink = {
  id: number;
  status: PartnerLinkStatus;
  role: PartnerLinkRole;
  createdAt: string;
  partner: PartnerProfile;
};

export type InvitePartnerInput = {
  email: string;
};

export const SAVINGS_ACCOUNT_TYPES = ['Easy Access', 'Term Deposit'] as const;
export type SavingsAccountType = (typeof SAVINGS_ACCOUNT_TYPES)[number];

export type SavingsAccount = {
  id: number;
  name: string;
  bank: string;
  bankingEntityId?: string | null;
  bankingEntityName?: string | null;
  depositGuaranteeScheme?: string | null;
  depositGuaranteeCap?: number | null;
  depositGuaranteeCurrency?: CurrencyCode | null;
  bankingEntityConfirmedAt?: string | null;
  balance: number;
  currency: CurrencyCode;
  interestRate: number;
  accountType: SavingsAccountType;
  color: string;
  emoji: string;
  bunqAccountId?: string | null;
  isJoint: boolean;
  userId?: number;
  archivedAt?: string | null;
};

export type BankingEntityOption = {
  id: string;
  name: string;
  scheme: string;
  cap: number;
  currency: CurrencyCode;
  country: string;
};

export type BankingEntityConfirmationInput =
  | { mode: 'known'; entityId: string }
  | {
      mode: 'manual';
      entityName: string;
      scheme: string;
      cap: number;
      currency: CurrencyCode;
    }
  | { mode: 'clear' };

export const SAVINGS_TRANSACTION_TYPES = ['deposit', 'withdrawal', 'interest'] as const;
export type SavingsTransactionType = (typeof SAVINGS_TRANSACTION_TYPES)[number];

export type SavingsTransaction = {
  id: number;
  accountId: number;
  type: SavingsTransactionType;
  amount: number;
  date: string;
  note: string;
  bunqTransactionId?: string | null;
};

// ── Ticker Item Types ─────────────────────────────────────────────────────────

export const TICKER_ITEM_TYPES = [
  'equity',
  'fund',
  'etf',
  'adr',
  'trust',
  'warrant',
  'right',
  'unit',
  'preference',
] as const;

export type TickerItemType = (typeof TICKER_ITEM_TYPES)[number];
const TICKER_ITEM_TYPE_SET = new Set<string>(TICKER_ITEM_TYPES);

export const ITEM_TYPE_LABELS: Record<TickerItemType, string> = {
  equity: 'Equity',
  fund: 'Fund',
  etf: 'ETF',
  adr: 'ADR',
  trust: 'Trust',
  warrant: 'Warrant',
  right: 'Right',
  unit: 'Unit',
  preference: 'Preference',
};

export function parseTickerItemType(raw: string | null | undefined): TickerItemType | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return TICKER_ITEM_TYPE_SET.has(normalized) ? (normalized as TickerItemType) : null;
}

export function formatItemType(raw: string | null | undefined): string {
  if (!raw) return '';
  const key = parseTickerItemType(raw);
  return key ? ITEM_TYPE_LABELS[key] : raw.trim();
}

export type TickerLookupExchange = {
  name: string;
  acronym: string;
  mic: string;
  country: string | null;
  countryCode: string;
  city: string;
  website: string;
};

export type TickerLookupResult = {
  name: string;
  symbol: string;
  itemType: TickerItemType | null;
  sector: string | null;
  industry: string | null;
  exchange: TickerLookupExchange | null;
  currentPrice?: number | null;
  currency?: string | null;
  priceCurrency?: string | null;
  priceUpdatedAt?: string | null;
  eodDate?: string | null;
};

export type StockPriceResult = {
  ticker: string;
  price: number;
  currency: string;
  tradeLast: string | null;
  eodDate?: string | null;
  priceCurrency?: string | null;
};

export type HoldingPriceSyncIssue = {
  holdingId: number;
  ticker: string;
  reason: string;
};

export type HoldingPriceSyncResult = {
  requestedHoldings: number;
  requestedSymbols: number;
  updatedHoldings: number;
  skippedHoldings: number;
  issues: HoldingPriceSyncIssue[];
  syncedAt: string;
};

// ── Holdings ─────────────────────────────────────────────────────────────────

export type Holding = {
  id: number;
  name: string;
  ticker: string;
  currentPrice: number;
  currency: CurrencyCode;
  sector: string;
  itemType?: TickerItemType | null;
  exchangeMic?: string | null;
  industry?: string | null;
  priceUpdatedAt?: string | null;
  manualPrice?: number | null;
  excludeFromSync?: boolean;
  archivedAt?: string | null;
};

export const HOLDING_TRANSACTION_TYPES = ['buy', 'sell', 'dividend'] as const;
export type HoldingTransactionType = (typeof HOLDING_TRANSACTION_TYPES)[number];

export type HoldingTransaction = {
  id: number;
  holdingId: number;
  type: HoldingTransactionType;
  shares: number | null;
  price: number;
  date: string;
  note: string;
};

export type HoldingPriceHistoryEntry = {
  id: number;
  userId: number;
  holdingId: number;
  eodDate: string;
  closePrice: number;
  priceCurrency: string;
  syncedAt: string;
};

export type Property = {
  id: number;
  address: string;
  propertyType: string;
  purchasePrice: number;
  currentValue: number;
  mortgage: number;
  mortgageId: number | null;
  monthlyRent: number;
  currency: CurrencyCode;
  emoji: string | null;
  isJoint: boolean;
  userId?: number;
  archivedAt?: string | null;
};

export const PROPERTY_TRANSACTION_TYPES = [
  'repayment',
  'valuation',
  'rent_income',
  'expense',
] as const;
export type PropertyTransactionType = (typeof PROPERTY_TRANSACTION_TYPES)[number];

export type PropertyTransaction = {
  id: number;
  propertyId: number;
  type: PropertyTransactionType;
  amount: number;
  interest: number | null;
  principal: number | null;
  date: string;
  note: string;
};

export const PENSION_POT_TYPES = [
  'Workplace Pension',
  'Personal Pension',
  'State Pension',
  'Other',
] as const;
export type PensionPotType = (typeof PENSION_POT_TYPES)[number];

export type PensionPot = {
  id: number;
  name: string;
  provider: string;
  type: PensionPotType;
  balance: number;
  currency: CurrencyCode;
  employeeMonthly: number;
  employerMonthly: number;
  investmentStrategy: string | null;
  metadata: Record<string, string>;
  color: string | null;
  emoji: string | null;
  notes: string;
  archivedAt?: string | null;
};

export const PENSION_TRANSACTION_TYPES = ['contribution', 'fee', 'annual_statement'] as const;
export type PensionTransactionType = (typeof PENSION_TRANSACTION_TYPES)[number];

export type PensionTransaction = {
  id: number;
  potId: number;
  type: PensionTransactionType;
  amount: number;
  taxAmount: number;
  date: string;
  note: string;
  isEmployer: boolean | null;
};

export type PdfDocument = {
  fileName: string;
  mimeType: 'application/pdf';
  sizeBytes: number;
  uploadedAt: string;
};

export type PensionStatementDocument = PdfDocument & {
  id: number;
  transactionId: number;
  potId: number;
};

export type PayslipDocument = PdfDocument;

export type PensionImportStatus =
  'queued' | 'processing' | 'ready_for_review' | 'failed' | 'committed' | 'expired' | 'cancelled';

export type PensionImportConfidenceLabel = 'high' | 'medium' | 'low';

export type PensionImportCollisionWarning = {
  existingTransactionId: number;
  reason: string;
};

export type AppCapabilityReason = 'worker_unavailable' | 'worker_stale' | 'parser_unhealthy';

export type AppCapabilityStatus = {
  enabled: boolean;
  reason: AppCapabilityReason | null;
  message: string;
  checkedAt: string;
};

export type AppCapabilities = {
  ai: AppCapabilityStatus;
  pensionStatementImport: AppCapabilityStatus;
};

export type PensionStatementImport = {
  id: number;
  potId: number;
  status: PensionImportStatus;
  fileName: string;
  mimeType: 'application/pdf';
  sizeBytes: number;
  fileHashSha256: string;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  languageHints: string[];
  modelName: string | null;
  modelVersion: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  committedAt: string | null;
  totalRows?: number;
  deletedRows?: number;
  activeRows?: number;
};

export type PensionStatementImportSummary = Pick<
  PensionStatementImport,
  | 'id'
  | 'potId'
  | 'status'
  | 'fileName'
  | 'errorMessage'
  | 'createdAt'
  | 'updatedAt'
  | 'totalRows'
  | 'deletedRows'
  | 'activeRows'
> & {
  potName: string;
  potProvider: string;
  potEmoji: string;
};

export type PensionStatementImportFeedItem = {
  import: PensionStatementImport;
  pot: {
    id: number;
    name: string;
    provider: string;
    emoji: string | null;
  };
};

export type PensionStatementImportRow = {
  id: number;
  importId: number;
  rowOrder: number;
  type: PensionTransaction['type'];
  amount: number;
  taxAmount: number;
  date: string;
  note: string;
  isEmployer: boolean | null;
  confidence: number;
  confidenceLabel: PensionImportConfidenceLabel;
  evidence: Array<{ page: number | null; snippet: string }>;
  isDerived: boolean;
  isDeleted: boolean;
  collisionWarning: PensionImportCollisionWarning | null;
  committedTransactionId: number | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const MORTGAGE_RATE_TYPES = ['Fixed', 'Variable'] as const;
export type MortgageRateType = (typeof MORTGAGE_RATE_TYPES)[number];

export const MORTGAGE_REPAYMENT_TYPES = ['Annuity', 'Linear'] as const;
export type MortgageRepaymentType = (typeof MORTGAGE_REPAYMENT_TYPES)[number];

export type Mortgage = {
  id: number;
  linkedPropertyId?: number | null;
  propertyAddress: string;
  lender: string;
  currency: CurrencyCode;
  originalAmount: number;
  outstandingBalance: number;
  propertyValue: number;
  monthlyPayment: number;
  interestRate: number;
  rateType: MortgageRateType;
  repaymentType: MortgageRepaymentType;
  fixedUntil: string;
  termYears: number;
  startDate: string;
  endDate: string;
  overpaymentLimit: number;
  isJoint: boolean;
  userId?: number;
  archivedAt?: string | null;
};

export const MORTGAGE_TRANSACTION_TYPES = ['repayment', 'valuation', 'rate_change'] as const;
export type MortgageTransactionType = (typeof MORTGAGE_TRANSACTION_TYPES)[number];

export type MortgageTransaction = {
  id: number;
  mortgageId: number;
  type: MortgageTransactionType;
  amount: number;
  interest: number | null;
  principal: number | null;
  date: string;
  note: string;
  fixedYears: number | null;
};

export const DEBT_TYPES = [
  'car_loan',
  'student_loan',
  'personal_loan',
  'credit_card',
  'overdraft',
  'other',
] as const;

export type DebtType = (typeof DEBT_TYPES)[number];

export type Debt = {
  id: number;
  name: string;
  type: DebtType;
  lender: string;
  originalAmount: number;
  remainingBalance: number;
  currency: CurrencyCode;
  interestRate: number;
  monthlyPayment: number;
  startDate: string;
  endDate: string | null;
  color: string;
  emoji: string;
  notes: string | null;
  archivedAt?: string | null;
};

export type DebtPayment = {
  id: number;
  debtId: number;
  date: string;
  amount: number;
  principal: number;
  interest: number;
  note: string;
};

export type Payslip = {
  id: number;
  employmentId: number | null;
  month: string;
  date: string;
  gross: number;
  tax: number;
  pension: number;
  net: number;
  bonus: number | null;
  currency: CurrencyCode;
  document: PayslipDocument | null;
};

export type SalaryHistory = {
  id: number;
  year: number;
  annualSalary: number;
  currency: CurrencyCode;
};

export const GOAL_TYPES = [
  'savings',
  'salary',
  'invest_habit',
  'portfolio',
  'net_worth',
  'annual',
] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_SOURCE_TYPES = [
  'manual',
  'salary_latest_gross',
  'savings_account',
  'portfolio_total',
  'net_worth_total',
  'invest_habit_buys',
] as const;

export type GoalSourceType = (typeof GOAL_SOURCE_TYPES)[number];

export type Goal = {
  id: number;
  type?: GoalType | null;
  sourceType: GoalSourceType;
  sourceId?: number | null;
  name: string;
  emoji: string | null;
  currentAmount: number;
  targetAmount: number;
  deadline: string;
  year?: number | null;
  category: string;
  monthlyContribution: number;
  monthlyTarget?: number | null;
  monthsCompleted?: number | null;
  totalMonths?: number | null;
  unit?: string | null;
  color: string;
  notes: string;
  currency: CurrencyCode;
  startMonth?: string | null;
  missedMonths?: string[] | null;
};

export type BudgetCategory = {
  id: number;
  name: string;
  emoji: string;
  budgeted: number;
  spent: number;
  color: string;
  month: BudgetMonth;
  year: number;
  expenseClass: ExpenseClass;
  expenseClassConfirmed: boolean;
};

export type BudgetTransaction = {
  id: number;
  categoryId: number;
  description: string;
  amount: number;
  date: string;
  merchant: string;
  bunqTransactionId?: string | null;
  sourceProvider?: string | null;
  sourceAccountId?: string | null;
  sourceAccountName?: string | null;
  sourceAccountType?: 'BANK' | 'JOINT' | 'SAVINGS' | string | null;
};

export type NetWorthSnapshot = {
  id: number;
  month: string;
  year: number;
  totalValue: number;
  currency: CurrencyCode;
  isEstimated: boolean;
};

export const EXPENSE_CLASSES = ['essential', 'discretionary', 'employment_linked'] as const;
export type ExpenseClass = (typeof EXPENSE_CLASSES)[number];

export const EMPLOYMENT_TYPES = ['employed', 'self_employed', 'other'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export type Employment = {
  id: number;
  employerName: string | null;
  employmentType: EmploymentType;
  serviceStartDate: string | null;
  endDate: string | null;
  noticePeriodMonths: number | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmploymentInput = {
  employerName: string;
  employmentType: EmploymentType;
  serviceStartDate: string | null;
  endDate: string | null;
  noticePeriodMonths: number | null;
  isPrimary: boolean;
};

export type EmploymentPatch = Partial<EmploymentInput>;

export const WW_WEEKLY_REQUIREMENT_STATUSES = ['unknown', 'met', 'not_met'] as const;
export type WwWeeklyRequirementStatus = (typeof WW_WEEKLY_REQUIREMENT_STATUSES)[number];

export type PlanAssumptions = {
  id: number;
  userId: number;
  leanBurnOverride: number | null;
  emergencyLifestylePct: number | null;
  excludedTiers: number[] | null;
  countFullJointBalances: boolean | null;
  benefitMonthlyOverride: number | null;
  benefitMaxMonthsOverride: number | null;
  wwWeeklyRequirement: WwWeeklyRequirementStatus | null;
  wwDurationMonths: number | null;
  wwDurationConfirmedAt: string | null;
  severanceMonthlySalaryOverride: number | null;
  updatedAt: string;
};

export type PlanAssumptionsInput = Partial<Omit<PlanAssumptions, 'id' | 'userId' | 'updatedAt'>>;

export type RunwayBurnSource = 'envelopes' | 'envelopes_partial' | 'derived_cashflow';
export type RunwayBand = 'critical' | 'building' | 'resilient';
export type CalculationComponentStatus = 'included' | 'unknown' | 'not_applicable' | 'excluded';

export type CalculationRuleSource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  reviewedAt: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isExtrapolated: boolean;
};

export type IncomeSupportCalculation = {
  effectiveTaxRate: number;
  taxRateSource: 'payslips' | 'jurisdiction_default';
  salaryBasis: {
    status: 'linked_payslips' | 'unlinked_fallback' | 'missing';
    payslipId: number | null;
    payslipDate: string | null;
    monthlyGross: number;
    monthlyNet: number;
    currency: CurrencyCode;
    note: string;
  };
  notice: {
    status: CalculationComponentStatus;
    months: number | null;
    monthlyNet: number;
    totalNet: number;
    reason: string;
  };
  severance: {
    status: CalculationComponentStatus;
    serviceStartDate: string | null;
    serviceDays: number | null;
    serviceYears: number | null;
    monthlyGross: number;
    gross: number;
    net: number;
    cap: number | null;
    reason: string;
  };
  unemployment: {
    status: CalculationComponentStatus;
    weeklyRequirement: WwWeeklyRequirementStatus;
    durationMonths: number | null;
    durationConfirmedAt: string | null;
    durationSource: 'confirmed' | 'minimum' | 'override' | 'unknown';
    monthlyNetByMonth: number[];
    unverifiedConditions: string[];
    reason: string;
  };
  sources: CalculationRuleSource[];
  warnings: string[];
};

export type RunwayResponse = {
  baseCurrency: CurrencyCode;
  asOf: string;
  jurisdiction: {
    code: JurisdictionCode;
    rulesEffectiveFrom: string;
    isExtrapolated: boolean;
  };
  employment: {
    primary: Employment | null;
    derived: {
      asOf: string;
      completedMonths: number;
      serviceDays: number;
      serviceYears: number;
    } | null;
    missingFields: string[];
  };
  burn: {
    lean: number;
    current: number;
    burnSource: RunwayBurnSource;
    isPartialHistory: boolean;
    unclassifiedCategoryCount: number;
    components: Array<{
      label: string;
      amount: number;
      source: 'budget_category' | 'mortgage' | 'debt';
      expenseClass: ExpenseClass;
    }>;
  };
  tiers: Array<{
    tier: number;
    label: string;
    amount: number;
    haircutPct: number;
    note: string;
    included: boolean;
  }>;
  incomeSupport: IncomeSupportCalculation;
  runway: {
    monthsCashOnly: number;
    monthsAllLiquid: number;
    monthsWithIncomeSupport: number | null;
    band: RunwayBand;
    ledger: Array<{
      month: number;
      income: number;
      burn: number;
      drawdown: number;
      liquidRemaining: number;
    }>;
  };
  depositGuarantee: Array<{
    entityId: string | null;
    entityName: string;
    scheme: string;
    total: number;
    cap: number | null;
    excess: number | null;
    ineligibleCurrencyTotal: number;
    confidence: 'verified' | 'unverified';
    accountIds: number[];
  }>;
  setupComplete: boolean;
  isEstimated: boolean;
};

export type AssetAllocation = {
  id: number;
  name: string;
  value: number;
  color: string;
  currency: CurrencyCode;
};

export type DashboardAllocationsSummary = {
  allocations: AssetAllocation[];
  liabilitiesTotal: number;
  debtCount: number;
};

export type CurrencyRate = {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  updatedAt: string;
};

export type DashboardTransaction = {
  id: number;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  date: string;
  category: string;
  currency: CurrencyCode;
  isJoint: boolean;
};

export type BunqConnection = {
  id: number;
  userId: number;
  bunqUserId: string | null;
  lastSyncAt: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
  syncError: string | null;
  createdAt: string;
};

export type CurrencyMeta = {
  symbol: string;
  name: string;
  flag: string;
};

export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  EUR: { symbol: '\u20ac', name: 'Euro', flag: '\ud83c\uddea\ud83c\uddfa' },
  GBP: { symbol: '\u00a3', name: 'British Pound', flag: '\ud83c\uddec\ud83c\udde7' },
  USD: { symbol: '$', name: 'US Dollar', flag: '\ud83c\uddfa\ud83c\uddf8' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', flag: '\ud83c\udde6\ud83c\uddfa' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', flag: '\ud83c\uddf3\ud83c\uddff' },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar', flag: '\ud83c\udde8\ud83c\udde6' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc', flag: '\ud83c\udde8\ud83c\udded' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', flag: '\ud83c\uddf8\ud83c\uddec' },
};

const CURRENCY_SET = new Set<CurrencyCode>(CURRENCY_CODES);

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && CURRENCY_SET.has(value as CurrencyCode);
}
