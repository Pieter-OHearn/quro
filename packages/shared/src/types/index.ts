export const CURRENCY_CODES = ['EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'SGD'] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export type User = {
  id: number;
  name: string;
  email: string;
  createdAt: string;
};

export type SavingsAccount = {
  id: number;
  name: string;
  bank: string;
  balance: number;
  currency: CurrencyCode;
  interestRate: number;
  accountType: 'Easy Access' | 'Term Deposit';
  color: string;
  emoji: string;
};

export type SavingsTransaction = {
  id: number;
  accountId: number;
  type: 'deposit' | 'withdrawal' | 'interest';
  amount: number;
  date: string;
  note: string;
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
};

export type HoldingTransaction = {
  id: number;
  holdingId: number;
  type: 'buy' | 'sell' | 'dividend';
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
  emoji: string;
};

export type PropertyTransaction = {
  id: number;
  propertyId: number;
  type: 'repayment' | 'valuation' | 'rent_income' | 'expense';
  amount: number;
  interest: number | null;
  principal: number | null;
  date: string;
  note: string;
};

export type PensionPot = {
  id: number;
  name: string;
  provider: string;
  type: 'Workplace' | 'SIPP' | 'Superannuation' | 'Final Salary' | 'Other';
  balance: number;
  currency: CurrencyCode;
  employeeMonthly: number;
  employerMonthly: number;
  color: string;
  emoji: string;
  notes: string;
};

export type PensionTransaction = {
  id: number;
  potId: number;
  type: 'contribution' | 'fee';
  amount: number;
  date: string;
  note: string;
  isEmployer: boolean | null;
};

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
  rateType: string;
  fixedUntil: string;
  termYears: number;
  startDate: string;
  endDate: string;
  overpaymentLimit: number;
};

export type MortgageTransaction = {
  id: number;
  mortgageId: number;
  type: 'repayment' | 'valuation' | 'rate_change';
  amount: number;
  interest: number | null;
  principal: number | null;
  date: string;
  note: string;
  fixedYears: number | null;
};

export type Payslip = {
  id: number;
  month: string;
  date: string;
  gross: number;
  tax: number;
  pension: number;
  net: number;
  bonus: number | null;
  currency: CurrencyCode;
};

export type SalaryHistory = {
  id: number;
  year: number;
  annualSalary: number;
  currency: CurrencyCode;
};

export type GoalType = 'savings' | 'salary' | 'invest_habit' | 'portfolio' | 'net_worth' | 'annual';

export type Goal = {
  id: number;
  type?: GoalType | null;
  name: string;
  emoji: string;
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
};

export type BudgetCategory = {
  id: number;
  name: string;
  emoji: string;
  budgeted: number;
  spent: number;
  color: string;
  month: string;
  year: number;
};

export type BudgetTransaction = {
  id: number;
  categoryId: number;
  description: string;
  amount: number;
  date: string;
  merchant: string;
};

export type NetWorthSnapshot = {
  id: number;
  month: string;
  year: number;
  totalValue: number;
  currency: CurrencyCode;
};

export type AssetAllocation = {
  id: number;
  name: string;
  value: number;
  color: string;
  snapshotId: number;
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
