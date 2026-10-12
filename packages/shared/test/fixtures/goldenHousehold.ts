import type {
  CurrencyCode,
  Debt,
  Holding,
  HoldingTransaction,
  Mortgage,
  PensionPot,
  Property,
  SavingsAccount,
} from '../../src/index.js';

// A synthetic household as one partner's API responses return it: the person's own rows and the
// accepted partner's joint rows, in their native currencies. The backend dashboard and the
// frontend pages both compute their totals from these rows; tests on each side assert the same
// golden figures below, so the two sides agree to the cent.
//
// It covers what the shared rules decide: joint shares of odd-cent amounts, an oversold holding,
// fractional shares that sum to zero, a zero-cost buy, six-decimal prices, a linked joint mortgage,
// negative property equity, a negative pension pot and property types in different spellings.

export const GOLDEN_RATES_TO_EUR: Readonly<Record<string, number>> = {
  EUR: 1,
  GBP: 1.18,
  USD: 0.92,
};

export const toGoldenEur = (amount: number, currency: string): number =>
  currency === 'EUR' ? amount : amount * GOLDEN_RATES_TO_EUR[currency]!;

const savings = (
  id: number,
  balance: number,
  currency: CurrencyCode,
  isJoint: boolean,
): SavingsAccount => ({
  id,
  name: `Account ${id}`,
  bank: 'Synthetic Bank',
  balance,
  currency,
  interestRate: 2,
  accountType: 'Easy Access',
  color: '#0ea5e9',
  emoji: 'S',
  isJoint,
});

export const GOLDEN_SAVINGS: readonly SavingsAccount[] = [
  savings(1, 10_000.01, 'EUR', false), // 10,000.01
  savings(2, 4_000.03, 'GBP', true), // 2,000.015 × 1.18 = 2,360.0177 → 2,360.02
  savings(3, 6_000.01, 'EUR', true), // 3,000.005 → 3,000.01
  savings(4, 1_234.56, 'USD', false), // 1,135.7952 → 1,135.80
];

const holding = (id: number, currentPrice: number, currency: CurrencyCode): Holding => ({
  id,
  name: `Holding ${id}`,
  ticker: `SYN${id}`,
  currentPrice,
  currency,
  sector: 'Index',
});

export const GOLDEN_HOLDINGS: readonly Holding[] = [
  holding(1, 50.123457, 'USD'), // 12 × 50.123457 = 601.481484 → 601.48 USD → 553.3616 → 553.36
  holding(2, 13, 'EUR'), // oversold then rebought: 5 shares → 65.00
  holding(3, 120, 'EUR'), // 0.1 + 0.2 - 0.3 shares: exactly none → 0
  holding(4, 3.333333, 'GBP'), // 4 shares → 13.333332 → 13.33 GBP → 15.7294 → 15.73
  holding(5, 4.5, 'EUR'), // 7 shares bought at zero cost → 31.50
];

let nextTransactionId = 1;
const trade = (
  holdingId: number,
  type: HoldingTransaction['type'],
  shares: number | null,
  price: number,
  date: string,
): HoldingTransaction => ({
  id: nextTransactionId++,
  holdingId,
  type,
  shares,
  price,
  date,
  note: '',
});

export const GOLDEN_HOLDING_TRANSACTIONS: readonly HoldingTransaction[] = [
  trade(1, 'buy', 10, 40.123456, '2026-01-05'),
  trade(1, 'buy', 5, 41.5, '2026-02-05'),
  trade(1, 'sell', 3, 45, '2026-03-05'),
  trade(1, 'dividend', null, 12.34, '2026-03-20'),
  trade(2, 'buy', 10, 10, '2026-01-10'),
  trade(2, 'sell', 15, 12, '2026-02-10'),
  trade(2, 'buy', 10, 11, '2026-03-10'),
  trade(3, 'buy', 0.1, 100, '2026-01-15'),
  trade(3, 'buy', 0.2, 100, '2026-02-15'),
  trade(3, 'sell', 0.3, 110, '2026-03-15'),
  trade(4, 'buy', 1.333333, 3.333333, '2026-04-01'),
  trade(4, 'buy', 2.666667, 3.1, '2026-05-01'),
  trade(5, 'buy', 7, 0, '2026-06-01'),
];

const property = (
  id: number,
  propertyType: string,
  currentValue: number,
  mortgage: number,
  mortgageId: number | null,
  currency: CurrencyCode,
  isJoint: boolean,
): Property => ({
  id,
  address: `${id} Synthetic Lane`,
  propertyType,
  purchasePrice: currentValue,
  currentValue,
  mortgage,
  mortgageId,
  monthlyRent: 0,
  currency,
  emoji: 'H',
  isJoint,
});

export const GOLDEN_PROPERTIES: readonly Property[] = [
  // Joint home with a linked joint mortgage: (400,000.01 - 250,000.03) × 0.5 = 74,999.99.
  property(1, 'primary_home', 400_000.01, 0, 1, 'EUR', true),
  // Negative equity is kept: (180,000 - 210,000) × 1.18 = -35,400.00.
  property(2, 'rental', 180_000, 210_000, null, 'GBP', false),
  property(3, ' Buy-To-Let ', 150_000, 0, null, 'EUR', false), // 150,000.00
];

export const GOLDEN_MORTGAGES: readonly Mortgage[] = [
  {
    id: 1,
    linkedPropertyId: 1,
    propertyAddress: '1 Synthetic Lane',
    lender: 'Synthetic Lender',
    currency: 'EUR',
    originalAmount: 300_000,
    outstandingBalance: 250_000.03,
    propertyValue: 400_000,
    monthlyPayment: 1_500,
    interestRate: 3,
    rateType: 'Fixed',
    repaymentType: 'Annuity',
    fixedUntil: '2031-01-01',
    termYears: 30,
    startDate: '2021-01-01',
    endDate: '2051-01-01',
    overpaymentLimit: 10,
    isJoint: true,
  },
];

const pot = (id: number, balance: number, currency: CurrencyCode): PensionPot => ({
  id,
  name: `Pot ${id}`,
  provider: 'Synthetic Provider',
  type: 'Workplace Pension',
  balance,
  currency,
  employeeMonthly: 0,
  employerMonthly: 0,
  investmentStrategy: null,
  metadata: {},
  color: null,
  emoji: null,
  notes: '',
});

export const GOLDEN_PENSIONS: readonly PensionPot[] = [
  pot(1, 30_000.5, 'EUR'),
  pot(2, -50, 'EUR'), // a pot driven below zero by fees is counted as it is stored
  pot(3, 1_000.01, 'GBP'), // 1,180.0118 → 1,180.01
];

const debt = (id: number, remainingBalance: number, currency: CurrencyCode): Debt => ({
  id,
  name: `Debt ${id}`,
  type: 'credit_card',
  lender: 'Synthetic Lender',
  originalAmount: remainingBalance,
  remainingBalance,
  currency,
  interestRate: 5,
  monthlyPayment: 100,
  startDate: '2026-01-01',
  endDate: null,
  color: '#ef4444',
  emoji: 'D',
  notes: null,
});

export const GOLDEN_DEBTS: readonly Debt[] = [
  debt(1, 1_500.25, 'EUR'),
  debt(2, 99.99, 'USD'), // 91.9908 → 91.99
];

/** The figures both sides must show for this household, in EUR. */
export const GOLDEN_TOTALS = {
  savings: 16_495.84,
  brokerage: 665.59,
  propertyEquity: 189_599.99,
  pension: 31_130.51,
  liabilities: 1_592.24,
  totalAssets: 237_891.93,
  netWorth: 236_299.69,
} as const;

/** Positions per holding (native currency), as the investments page shows them. */
export const GOLDEN_POSITIONS = {
  // Each trade costs shares × price rounded to cents: 401.23 + 207.50 = 608.73; selling 3 of 15
  // removes 121.75 of cost for 135.00, a 13.25 gain.
  1: { shares: 12, costBasis: 486.98, realizedGain: 13.25, totalDividends: 12.34 },
  // The sell of 15 sells the 10 held (gain 20.00); the next buy covers the 5 oversold shares first,
  // so only 5 shares carry cost: 55.00.
  2: { shares: 5, costBasis: 55, realizedGain: 20, totalDividends: 0 },
  3: { shares: 0, costBasis: 0, realizedGain: 3, totalDividends: 0 },
  4: { shares: 4, costBasis: 12.71, realizedGain: 0, totalDividends: 0 },
  5: { shares: 7, costBasis: 0, realizedGain: 0, totalDividends: 0 },
} as const;
