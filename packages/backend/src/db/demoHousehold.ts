/* eslint-disable no-magic-numbers -- fixed synthetic demo values; every number here is data. */
import {
  fromCents,
  toCents,
  type CurrencyCode,
  type GoalType,
  type PensionPotType,
  type SavingsAccountType,
} from '@quro/shared';
import { CATEGORY_PRESETS } from '../services/bunqCategoryRules';
import { DEMO_PARTNER_EMAIL, DEMO_USER_EMAIL } from './maintenance';

// The synthetic household behind `db:seed-household`: the demo user and a linked partner with
// private and joint rows across every page. Everything is fixed data. Dates stop at HOUSEHOLD_AS_OF,
// so rows never sit in the future, and amounts have at most two decimals. Names, banks, lenders and
// addresses are invented. This module holds the data and its derived expectations only; the seeder
// (seedHousehold.ts) writes it through the application's own routes.

export type Member = 'demo' | 'partner';

/** The last day any seeded row is dated. */
export const HOUSEHOLD_AS_OF = '2026-10-09';

/** Provenance timestamps the routes would otherwise stamp with the clock. */
export const HOUSEHOLD_TIMESTAMPS = {
  partnerInvitedAt: '2025-01-05T10:00:00.000Z',
  partnerAcceptedAt: '2025-01-05T11:30:00.000Z',
  employmentsRecordedAt: '2025-01-02T09:00:00.000Z',
  pricesSyncedAt: '2026-10-09T18:00:00.000Z',
} as const;

export const DEMO_PARTNER_PROFILE = {
  firstName: 'Demo',
  lastName: 'Partner',
  email: DEMO_PARTNER_EMAIL,
  baseCurrency: 'EUR',
  numberFormat: 'en-US',
  age: 34,
  retirementAge: 67,
} as const;

// The swatches the interface offers, kept at their persisted hex identity.
const COLOR = {
  primary: '#6366f1',
  cash: '#0ea5e9',
  income: '#10b981',
  forecast: '#f59e0b',
  property: '#f97316',
  milestone: '#ec4899',
  recurring: '#14b8a6',
  portfolio: '#8b5cf6',
  alert: '#ef4444',
} as const;

// ── Savings ──────────────────────────────────────────────────────────────────

type SavingsTransactionSpec = {
  by: Member;
  type: 'deposit' | 'withdrawal' | 'interest';
  amount: number;
  date: string;
  note: string;
};

export type SavingsAccountSpec = {
  key: string;
  owner: Member;
  name: string;
  bank: string;
  currency: CurrencyCode;
  interestRate: number;
  accountType: SavingsAccountType;
  color: string;
  emoji: string;
  isJoint: boolean;
  /** Balance before the first ledger row. */
  openingBalance: number;
  transactions: readonly SavingsTransactionSpec[];
};

export const SAVINGS_ACCOUNTS: readonly SavingsAccountSpec[] = [
  {
    key: 'everyday',
    owner: 'demo',
    name: 'Everyday Account',
    bank: 'Example Bank',
    currency: 'EUR',
    interestRate: 0.1,
    accountType: 'Easy Access',
    color: COLOR.primary,
    emoji: '💳',
    isJoint: false,
    openingBalance: 350,
    transactions: [
      { by: 'demo', type: 'deposit', amount: 2000, date: '2025-01-03', note: 'Monthly top-up' },
      { by: 'demo', type: 'deposit', amount: 1500, date: '2025-03-01', note: 'Monthly top-up' },
      { by: 'demo', type: 'withdrawal', amount: 900, date: '2025-06-15', note: 'Summer break' },
      { by: 'demo', type: 'deposit', amount: 1800, date: '2025-09-01', note: 'Monthly top-up' },
      { by: 'demo', type: 'withdrawal', amount: 1200, date: '2026-02-10', note: 'New laptop' },
      { by: 'demo', type: 'deposit', amount: 2200, date: '2026-06-30', note: 'Monthly top-up' },
      { by: 'demo', type: 'deposit', amount: 1650, date: '2026-09-02', note: 'Monthly top-up' },
    ],
  },
  {
    key: 'emergency',
    owner: 'demo',
    name: 'Emergency Fund',
    bank: 'Voorbeeld Spaarbank',
    currency: 'EUR',
    interestRate: 2.5,
    accountType: 'Easy Access',
    color: COLOR.income,
    emoji: '🛟',
    isJoint: false,
    openingBalance: 0,
    transactions: [
      { by: 'demo', type: 'deposit', amount: 6000, date: '2025-01-15', note: 'Opening deposit' },
      { by: 'demo', type: 'deposit', amount: 750, date: '2025-05-30', note: 'Quarterly saving' },
      { by: 'demo', type: 'deposit', amount: 750, date: '2025-08-29', note: 'Quarterly saving' },
      { by: 'demo', type: 'deposit', amount: 750, date: '2025-11-28', note: 'Quarterly saving' },
      { by: 'demo', type: 'interest', amount: 152.35, date: '2025-12-31', note: 'Annual interest' },
      { by: 'demo', type: 'deposit', amount: 750, date: '2026-02-27', note: 'Quarterly saving' },
      { by: 'demo', type: 'withdrawal', amount: 1000, date: '2026-03-14', note: 'Boiler repair' },
      { by: 'demo', type: 'deposit', amount: 750, date: '2026-05-29', note: 'Quarterly saving' },
      {
        by: 'demo',
        type: 'interest',
        amount: 118.4,
        date: '2026-06-30',
        note: 'Half-year interest',
      },
      { by: 'demo', type: 'deposit', amount: 750, date: '2026-08-28', note: 'Quarterly saving' },
    ],
  },
  {
    key: 'joint',
    owner: 'demo',
    name: 'Joint Household',
    bank: 'Example Bank',
    currency: 'EUR',
    interestRate: 1.75,
    accountType: 'Easy Access',
    color: COLOR.recurring,
    emoji: '🏡',
    isJoint: true,
    openingBalance: 0,
    transactions: [
      { by: 'demo', type: 'deposit', amount: 3000, date: '2025-01-10', note: 'Opening deposit' },
      { by: 'demo', type: 'deposit', amount: 1200, date: '2025-04-01', note: 'Contribution' },
      { by: 'partner', type: 'deposit', amount: 1200, date: '2025-04-02', note: 'Contribution' },
      {
        by: 'partner',
        type: 'withdrawal',
        amount: 2400,
        date: '2025-08-20',
        note: 'Holiday booking',
      },
      { by: 'demo', type: 'deposit', amount: 1200, date: '2025-10-01', note: 'Contribution' },
      { by: 'partner', type: 'deposit', amount: 1200, date: '2025-10-02', note: 'Contribution' },
      { by: 'demo', type: 'interest', amount: 48.75, date: '2025-12-31', note: 'Annual interest' },
      {
        by: 'demo',
        type: 'withdrawal',
        amount: 1850,
        date: '2026-03-05',
        note: 'Kitchen appliances',
      },
      { by: 'demo', type: 'deposit', amount: 1200, date: '2026-04-01', note: 'Contribution' },
      { by: 'partner', type: 'deposit', amount: 1200, date: '2026-04-02', note: 'Contribution' },
      {
        by: 'demo',
        type: 'interest',
        amount: 41.2,
        date: '2026-06-30',
        note: 'Half-year interest',
      },
    ],
  },
  {
    key: 'uk',
    owner: 'demo',
    name: 'UK Savings',
    bank: 'Sample Building Society',
    currency: 'GBP',
    interestRate: 3.9,
    accountType: 'Term Deposit',
    color: COLOR.forecast,
    emoji: '💷',
    isJoint: false,
    openingBalance: 0,
    transactions: [
      { by: 'demo', type: 'deposit', amount: 4000, date: '2025-02-20', note: 'Fixed-term deposit' },
      { by: 'demo', type: 'deposit', amount: 2500, date: '2025-08-20', note: 'Fixed-term deposit' },
      { by: 'demo', type: 'interest', amount: 178.5, date: '2026-02-20', note: 'Interest paid' },
    ],
  },
  {
    key: 'partnerEveryday',
    owner: 'partner',
    name: 'Partner Everyday',
    bank: 'Example Bank',
    currency: 'EUR',
    interestRate: 0.05,
    accountType: 'Easy Access',
    color: COLOR.cash,
    emoji: '👛',
    isJoint: false,
    openingBalance: 500,
    transactions: [
      { by: 'partner', type: 'deposit', amount: 1800, date: '2025-01-05', note: 'Monthly top-up' },
      { by: 'partner', type: 'deposit', amount: 1400, date: '2025-07-01', note: 'Monthly top-up' },
      { by: 'partner', type: 'withdrawal', amount: 650, date: '2026-01-08', note: 'New bike' },
      { by: 'partner', type: 'deposit', amount: 1500, date: '2026-07-01', note: 'Monthly top-up' },
    ],
  },
  {
    key: 'partnerUsd',
    owner: 'partner',
    name: 'Dollar Savings',
    bank: 'Sample Credit Union',
    currency: 'USD',
    interestRate: 4.1,
    accountType: 'Easy Access',
    color: COLOR.milestone,
    emoji: '💵',
    isJoint: false,
    openingBalance: 0,
    transactions: [
      { by: 'partner', type: 'deposit', amount: 3000, date: '2025-03-14', note: 'Opening deposit' },
      { by: 'partner', type: 'deposit', amount: 1500, date: '2025-09-12', note: 'Top-up' },
      {
        by: 'partner',
        type: 'interest',
        amount: 62.4,
        date: '2025-12-31',
        note: 'Annual interest',
      },
      {
        by: 'partner',
        type: 'interest',
        amount: 91.15,
        date: '2026-06-30',
        note: 'Half-year interest',
      },
    ],
  },
  {
    key: 'holiday',
    owner: 'partner',
    name: 'Ferienfonds Zürich',
    bank: 'Beispiel Kantonalbank',
    currency: 'CHF',
    interestRate: 1,
    accountType: 'Easy Access',
    color: COLOR.property,
    emoji: '🏔️',
    isJoint: true,
    openingBalance: 0,
    transactions: [
      { by: 'partner', type: 'deposit', amount: 800, date: '2025-02-01', note: 'Einzahlung' },
      { by: 'demo', type: 'deposit', amount: 800, date: '2025-02-02', note: 'Einzahlung' },
      { by: 'partner', type: 'withdrawal', amount: 1100, date: '2025-08-01', note: 'Alpenreise' },
      { by: 'partner', type: 'deposit', amount: 600, date: '2026-02-01', note: 'Einzahlung' },
      { by: 'demo', type: 'deposit', amount: 600, date: '2026-02-02', note: 'Einzahlung' },
    ],
  },
];

function savingsEffect(transaction: Pick<SavingsTransactionSpec, 'type' | 'amount'>): number {
  return transaction.type === 'withdrawal'
    ? -toCents(transaction.amount)
    : toCents(transaction.amount);
}

/** The balance the app derives: the opening balance plus every ledger row. */
export function expectedSavingsBalance(account: SavingsAccountSpec): number {
  return fromCents(
    account.transactions.reduce(
      (sum, transaction) => sum + savingsEffect(transaction),
      toCents(account.openingBalance),
    ),
  );
}

// ── Investments ──────────────────────────────────────────────────────────────

type HoldingTransactionSpec = {
  type: 'buy' | 'sell' | 'dividend';
  /** Null for a dividend, whose `price` is the amount received. */
  shares: number | null;
  price: number;
  date: string;
  note: string;
};

export type HoldingSpec = {
  key: string;
  owner: Member;
  name: string;
  ticker: string;
  currency: CurrencyCode;
  sector: string;
  itemType: 'equity' | 'etf' | 'fund';
  currentPrice: number;
  transactions: readonly HoldingTransactionSpec[];
  /** Close prices in date order; the last one is the current price. */
  priceHistory: readonly (readonly [date: string, close: number])[];
};

export const HOLDINGS: readonly HoldingSpec[] = [
  {
    key: 'globalEtf',
    owner: 'demo',
    name: 'Example Global Equity ETF',
    ticker: 'EXGE',
    currency: 'EUR',
    sector: 'Diversified',
    itemType: 'etf',
    currentPrice: 112.4,
    transactions: [
      { type: 'buy', shares: 20, price: 90, date: '2025-02-03', note: 'Monthly plan' },
      { type: 'buy', shares: 15, price: 96.5, date: '2025-06-02', note: 'Monthly plan' },
      { type: 'buy', shares: 10, price: 105, date: '2025-11-03', note: 'Monthly plan' },
      { type: 'dividend', shares: null, price: 36.8, date: '2025-12-15', note: 'Dividend' },
      { type: 'sell', shares: 5, price: 109.5, date: '2026-04-01', note: 'Rebalancing' },
      { type: 'dividend', shares: null, price: 41.25, date: '2026-06-15', note: 'Dividend' },
    ],
    priceHistory: [
      ['2025-01-31', 88.2],
      ['2025-02-28', 90.4],
      ['2025-03-31', 87.1],
      ['2025-04-30', 91.6],
      ['2025-05-30', 95.3],
      ['2025-06-30', 96.8],
      ['2025-07-31', 99.4],
      ['2025-08-29', 98.1],
      ['2025-09-30', 102.3],
      ['2025-10-31', 104.6],
      ['2025-11-28', 105.9],
      ['2025-12-31', 108.2],
      ['2026-01-30', 106.4],
      ['2026-02-27', 103.9],
      ['2026-03-31', 107.8],
      ['2026-04-30', 111.2],
      ['2026-05-29', 113.6],
      ['2026-06-30', 110.9],
      ['2026-07-31', 112.7],
      ['2026-08-31', 111.3],
      ['2026-09-30', 113.9],
      [HOUSEHOLD_AS_OF, 112.4],
    ],
  },
  {
    key: 'usFund',
    owner: 'demo',
    name: 'Sample US Tech Fund',
    ticker: 'SMTF',
    currency: 'USD',
    sector: 'Technology',
    itemType: 'fund',
    currentPrice: 187.2,
    transactions: [
      { type: 'buy', shares: 10, price: 143, date: '2025-03-03', note: 'Lump sum' },
      { type: 'buy', shares: 6, price: 172, date: '2025-09-01', note: 'Lump sum' },
      { type: 'dividend', shares: null, price: 8.4, date: '2026-03-25', note: 'Dividend' },
      { type: 'sell', shares: 4, price: 190.5, date: '2026-05-04', note: 'Took some profit' },
    ],
    priceHistory: [
      ['2025-01-31', 141.2],
      ['2025-02-28', 146.8],
      ['2025-03-31', 139.4],
      ['2025-04-30', 148.9],
      ['2025-05-30', 158.7],
      ['2025-06-30', 163.2],
      ['2025-07-31', 170.6],
      ['2025-08-29', 168.4],
      ['2025-09-30', 174.1],
      ['2025-10-31', 171.3],
      ['2025-11-28', 178.9],
      ['2025-12-31', 183.7],
      ['2026-01-30', 176.4],
      ['2026-02-27', 169.2],
      ['2026-03-31', 181.5],
      ['2026-04-30', 189.3],
      ['2026-05-29', 192.8],
      ['2026-06-30', 185.6],
      ['2026-07-31', 190.4],
      ['2026-08-31', 182.9],
      ['2026-09-30', 189.7],
      [HOUSEHOLD_AS_OF, 187.2],
    ],
  },
  {
    // Bought above today's price: a position at a loss.
    key: 'lossMaker',
    owner: 'demo',
    name: 'Fictional Retail Group',
    ticker: 'FRGP',
    currency: 'GBP',
    sector: 'Consumer',
    itemType: 'equity',
    currentPrice: 18.75,
    transactions: [
      { type: 'buy', shares: 100, price: 32.4, date: '2025-02-17', note: 'First purchase' },
      { type: 'buy', shares: 50, price: 25.1, date: '2025-08-11', note: 'Averaged down' },
    ],
    priceHistory: [
      ['2025-01-31', 35.6],
      ['2025-02-28', 31.9],
      ['2025-03-31', 30.1],
      ['2025-04-30', 28.4],
      ['2025-05-30', 27.8],
      ['2025-06-30', 29.6],
      ['2025-07-31', 26.9],
      ['2025-08-29', 25.2],
      ['2025-09-30', 24.1],
      ['2025-10-31', 23.4],
      ['2025-11-28', 22.6],
      ['2025-12-31', 22.9],
      ['2026-01-30', 21.7],
      ['2026-02-27', 20.8],
      ['2026-03-31', 21.4],
      ['2026-04-30', 19.9],
      ['2026-05-29', 20.3],
      ['2026-06-30', 19.4],
      ['2026-07-31', 18.2],
      ['2026-08-31', 19.1],
      ['2026-09-30', 18.6],
      [HOUSEHOLD_AS_OF, 18.75],
    ],
  },
  {
    key: 'partnerDividend',
    owner: 'partner',
    name: 'Example Dividend Fund',
    ticker: 'EXDV',
    currency: 'EUR',
    sector: 'Income',
    itemType: 'fund',
    currentPrice: 54.3,
    transactions: [
      { type: 'buy', shares: 40, price: 49.8, date: '2025-04-07', note: 'First purchase' },
      { type: 'buy', shares: 20, price: 52.6, date: '2026-01-12', note: 'Top-up' },
      { type: 'dividend', shares: null, price: 62, date: '2026-03-20', note: 'Dividend' },
    ],
    priceHistory: [
      ['2025-03-31', 49.1],
      ['2025-06-30', 50.6],
      ['2025-09-30', 51.9],
      ['2025-12-31', 52.4],
      ['2026-03-31', 53.8],
      ['2026-06-30', 54.1],
      ['2026-09-30', 53.6],
      [HOUSEHOLD_AS_OF, 54.3],
    ],
  },
];

/** Shares held: buys minus sells, floored at zero, as the app counts them. */
export function expectedShares(holding: HoldingSpec): number {
  const net = holding.transactions.reduce((sum, transaction) => {
    if (transaction.type === 'dividend') return sum;
    const shares = transaction.shares ?? 0;
    return sum + (transaction.type === 'buy' ? shares : -shares);
  }, 0);
  return Math.max(0, net);
}

// ── Property and mortgage ────────────────────────────────────────────────────

type RepaymentSpec = { by: Member; date: string; amount: number; interest: number; note: string };

type PropertyTransactionSpec =
  | { type: 'valuation' | 'rent_income' | 'expense'; amount: number; date: string; note: string }
  | { type: 'repayment'; amount: number; interest: number; date: string; note: string };

export type PropertySpec = {
  key: string;
  owner: Member;
  address: string;
  propertyType: string;
  purchasePrice: number;
  currentValue: number;
  currency: CurrencyCode;
  monthlyRent: number;
  emoji: string;
  isJoint: boolean;
  /** Debt kept on the property itself, for a property without a linked mortgage. */
  manualMortgage: number;
  transactions: readonly PropertyTransactionSpec[];
};

export type MortgageSpec = {
  /** Key of the property it is linked to. */
  propertyKey: string;
  owner: Member;
  lender: string;
  originalAmount: number;
  /** Balance before the first repayment below. */
  openingBalance: number;
  monthlyPayment: number;
  interestRate: number;
  fixedUntil: string;
  termYears: number;
  startDate: string;
  endDate: string;
  overpaymentLimit: number;
  isJoint: boolean;
  rateChange: { date: string; rate: number; fixedYears: number; note: string };
  repayments: readonly RepaymentSpec[];
};

type Amortised = { date: string; amount: number; interest: number; principal: number };

/**
 * Monthly instalments in integer cents. Interest is the monthly rate on the balance before the
 * payment, rounded half away from zero; the rest of the instalment is principal.
 */
export function amortise(
  openingBalance: number,
  annualRatePercent: number,
  payment: number,
  dates: readonly string[],
): Amortised[] {
  let balance = toCents(openingBalance);
  return dates.map((date) => {
    const interest = Math.min(
      toCents(fromCents(balance) * (annualRatePercent / 1200)),
      toCents(payment),
    );
    const principal = Math.min(toCents(payment) - interest, balance);
    balance -= principal;
    return {
      date,
      amount: payment,
      interest: fromCents(interest),
      principal: fromCents(principal),
    };
  });
}

const HOME_PAYMENT_DATES = [
  '2025-10-01',
  '2025-11-01',
  '2025-12-01',
  '2026-01-01',
  '2026-02-01',
  '2026-03-01',
  '2026-04-01',
  '2026-05-01',
  '2026-06-01',
  '2026-07-01',
  '2026-08-01',
  '2026-09-01',
];

export const MORTGAGE: MortgageSpec = ((): MortgageSpec => {
  const base = {
    openingBalance: 284500,
    monthlyPayment: 1428,
    interestRate: 3.45,
  };
  return {
    propertyKey: 'home',
    owner: 'demo',
    lender: 'Example Mortgages',
    originalAmount: 320000,
    ...base,
    fixedUntil: '2035-04-01',
    termYears: 30,
    startDate: '2023-04-01',
    endDate: '2053-04-01',
    overpaymentLimit: 10,
    isJoint: true,
    rateChange: {
      date: '2025-04-01',
      rate: 3.45,
      fixedYears: 10,
      note: 'Rate fixed for ten years',
    },
    // The partners alternate who pays.
    repayments: amortise(
      base.openingBalance,
      base.interestRate,
      base.monthlyPayment,
      HOME_PAYMENT_DATES,
    ).map((row, index) => ({
      by: index % 2 === 0 ? 'demo' : 'partner',
      date: row.date,
      amount: row.amount,
      interest: row.interest,
      note: 'Monthly instalment',
    })),
  };
})();

const FLAT_OPENING_MORTGAGE = 192500;
const FLAT_PAYMENT = 760;
const FLAT_PAYMENT_DATES = [
  '2026-04-05',
  '2026-05-05',
  '2026-06-05',
  '2026-07-05',
  '2026-08-05',
  '2026-09-05',
];
const FLAT_RENT_DATES = [
  '2026-04-28',
  '2026-05-28',
  '2026-06-28',
  '2026-07-28',
  '2026-08-28',
  '2026-09-28',
];

export const PROPERTIES: readonly PropertySpec[] = [
  {
    key: 'home',
    owner: 'demo',
    address: '12 Voorbeeldstraat, Exampleville',
    propertyType: 'Primary Residence',
    purchasePrice: 340000,
    currentValue: 395000,
    currency: 'EUR',
    monthlyRent: 0,
    emoji: '🏠',
    isJoint: true,
    manualMortgage: 0,
    transactions: [
      {
        type: 'valuation',
        amount: 372000,
        date: '2025-06-30',
        note: 'Valuation by Example Appraisals',
      },
      {
        type: 'valuation',
        amount: 395000,
        date: '2026-06-30',
        note: 'Valuation by Example Appraisals',
      },
    ],
  },
  {
    // Worth less than its debt: negative equity, in pounds.
    key: 'flat',
    owner: 'demo',
    address: '8 Sample Court, Exampleton',
    propertyType: 'Buy-to-Let',
    purchasePrice: 210000,
    currentValue: 178000,
    currency: 'GBP',
    monthlyRent: 950,
    emoji: '🏢',
    isJoint: false,
    manualMortgage: FLAT_OPENING_MORTGAGE,
    transactions: [
      { type: 'valuation', amount: 178000, date: '2026-03-01', note: 'Lender valuation' },
      { type: 'expense', amount: 420, date: '2026-03-18', note: 'Boiler service' },
      ...amortise(FLAT_OPENING_MORTGAGE, 3.2, FLAT_PAYMENT, FLAT_PAYMENT_DATES).map(
        (row): PropertyTransactionSpec => ({
          type: 'repayment',
          amount: row.amount,
          interest: row.interest,
          date: row.date,
          note: 'Monthly instalment',
        }),
      ),
      ...FLAT_RENT_DATES.map((date): PropertyTransactionSpec => ({
        type: 'rent_income',
        amount: 950,
        date,
        note: 'Rent received',
      })),
      { type: 'expense', amount: 1150, date: '2026-07-22', note: 'Roof repair' },
    ],
  },
];

/** Outstanding debt after the ledger: the opening balance less every repayment's principal. */
export function expectedMortgageBalance(mortgage: MortgageSpec): number {
  return fromCents(
    mortgage.repayments.reduce(
      (balance, repayment) => balance - (toCents(repayment.amount) - toCents(repayment.interest)),
      toCents(mortgage.openingBalance),
    ),
  );
}

/** The same for a property that carries its own debt. */
export function expectedPropertyDebt(property: PropertySpec): number {
  return fromCents(
    property.transactions.reduce(
      (balance, transaction) =>
        transaction.type === 'repayment'
          ? balance - (toCents(transaction.amount) - toCents(transaction.interest))
          : balance,
      toCents(property.manualMortgage),
    ),
  );
}

// ── Pensions ─────────────────────────────────────────────────────────────────

type PensionTransactionSpec = {
  type: 'contribution' | 'fee' | 'annual_statement';
  amount: number;
  taxAmount: number;
  date: string;
  note: string;
  isEmployer: boolean | null;
};

export type PensionPotSpec = {
  key: string;
  owner: Member;
  name: string;
  provider: string;
  type: PensionPotType;
  currency: CurrencyCode;
  openingBalance: number;
  employeeMonthly: number;
  employerMonthly: number;
  investmentStrategy: string;
  color: string;
  emoji: string;
  notes: string;
  transactions: readonly PensionTransactionSpec[];
};

const WORKPLACE_CONTRIBUTION_DATES = [
  '2026-01-25',
  '2026-02-25',
  '2026-03-25',
  '2026-04-25',
  '2026-05-25',
  '2026-06-25',
  '2026-07-25',
  '2026-08-25',
  '2026-09-25',
];
const PERSONAL_CONTRIBUTION_DATES = [
  '2026-04-10',
  '2026-05-10',
  '2026-06-10',
  '2026-07-10',
  '2026-08-10',
  '2026-09-10',
];

export const PENSION_POTS: readonly PensionPotSpec[] = [
  {
    key: 'workplace',
    owner: 'demo',
    name: 'Example Workplace Pension',
    provider: 'Example Pensions B.V.',
    type: 'Workplace Pension',
    currency: 'EUR',
    openingBalance: 41250,
    employeeMonthly: 350,
    employerMonthly: 525,
    investmentStrategy: 'Balanced (60/40)',
    color: COLOR.portfolio,
    emoji: '🏦',
    notes: 'Employer matches contributions up to 6% of salary.',
    transactions: [
      {
        type: 'fee',
        amount: 62.5,
        taxAmount: 0,
        date: '2025-12-31',
        note: 'Annual platform fee',
        isEmployer: null,
      },
      {
        type: 'annual_statement',
        amount: 2905.6,
        taxAmount: 0,
        date: '2025-12-31',
        note: 'Annual statement 2025: investment growth',
        isEmployer: null,
      },
      ...WORKPLACE_CONTRIBUTION_DATES.flatMap((date): PensionTransactionSpec[] => [
        {
          type: 'contribution',
          amount: 350,
          taxAmount: 0,
          date,
          note: 'Employee contribution',
          isEmployer: false,
        },
        {
          type: 'contribution',
          amount: 525,
          taxAmount: 0,
          date,
          note: 'Employer contribution',
          isEmployer: true,
        },
      ]),
      {
        type: 'annual_statement',
        amount: -415.3,
        taxAmount: 0,
        date: '2026-06-30',
        note: 'Half-year statement: market dip',
        isEmployer: null,
      },
    ],
  },
  {
    key: 'personalUk',
    owner: 'partner',
    name: 'Example Personal Pension',
    provider: 'Sample Pensions plc',
    type: 'Personal Pension',
    currency: 'GBP',
    openingBalance: 18400,
    employeeMonthly: 300,
    employerMonthly: 0,
    investmentStrategy: 'Growth',
    color: COLOR.cash,
    emoji: '🏦',
    notes: '',
    transactions: [
      {
        type: 'annual_statement',
        amount: 1120.75,
        taxAmount: 0,
        date: '2026-03-31',
        note: 'Annual statement 2025/26',
        isEmployer: null,
      },
      {
        type: 'fee',
        amount: 35,
        taxAmount: 0,
        date: '2026-03-31',
        note: 'Annual charge',
        isEmployer: null,
      },
      {
        type: 'contribution',
        amount: 2000,
        taxAmount: 400,
        date: '2026-04-05',
        note: 'Lump sum, basic-rate tax withheld',
        isEmployer: false,
      },
      ...PERSONAL_CONTRIBUTION_DATES.map((date): PensionTransactionSpec => ({
        type: 'contribution',
        amount: 300,
        taxAmount: 0,
        date,
        note: 'Monthly contribution',
        isEmployer: false,
      })),
    ],
  },
];

function pensionEffect(transaction: PensionTransactionSpec): number {
  if (transaction.type === 'contribution') {
    return toCents(transaction.amount) - toCents(transaction.taxAmount);
  }
  return transaction.type === 'fee' ? -toCents(transaction.amount) : toCents(transaction.amount);
}

export function expectedPensionBalance(pot: PensionPotSpec): number {
  return fromCents(
    pot.transactions.reduce(
      (sum, transaction) => sum + pensionEffect(transaction),
      toCents(pot.openingBalance),
    ),
  );
}

// ── Debts ────────────────────────────────────────────────────────────────────

export type DebtSpec = {
  key: string;
  owner: Member;
  name: string;
  type: 'car_loan' | 'credit_card';
  lender: string;
  originalAmount: number;
  /** Balance before the first payment below. */
  openingBalance: number;
  currency: CurrencyCode;
  interestRate: number;
  monthlyPayment: number;
  startDate: string;
  endDate: string | null;
  color: string;
  emoji: string;
  notes: string | null;
  payments: readonly { date: string; amount: number; interest: number; note: string }[];
};

function paymentRows(
  openingBalance: number,
  ratePercent: number,
  payment: number,
  dates: readonly string[],
  note: string,
) {
  return amortise(openingBalance, ratePercent, payment, dates).map((row) => ({
    date: row.date,
    amount: row.amount,
    interest: row.interest,
    note,
  }));
}

export const DEBTS: readonly DebtSpec[] = [
  {
    key: 'carLoan',
    owner: 'demo',
    name: 'Example Car Loan',
    type: 'car_loan',
    lender: 'Voorbeeld Autolening',
    originalAmount: 14000,
    openingBalance: 9800,
    currency: 'EUR',
    interestRate: 5.25,
    monthlyPayment: 310,
    startDate: '2024-03-01',
    endDate: '2028-02-29',
    color: COLOR.alert,
    emoji: '🚗',
    notes: 'Fixed instalments, no early repayment fee.',
    payments: paymentRows(
      9800,
      5.25,
      310,
      [
        '2026-01-15',
        '2026-02-15',
        '2026-03-15',
        '2026-04-15',
        '2026-05-15',
        '2026-06-15',
        '2026-07-15',
        '2026-08-15',
        '2026-09-15',
      ],
      'Monthly instalment',
    ),
  },
  {
    key: 'creditCard',
    owner: 'partner',
    name: 'Example Credit Card',
    type: 'credit_card',
    lender: 'Sample Card Co',
    originalAmount: 2500,
    openingBalance: 1240,
    currency: 'USD',
    interestRate: 19.99,
    monthlyPayment: 150,
    startDate: '2025-06-01',
    endDate: null,
    color: COLOR.milestone,
    emoji: '💳',
    notes: null,
    payments: paymentRows(
      1240,
      19.99,
      150,
      ['2026-07-20', '2026-08-20', '2026-09-20'],
      'Monthly payment',
    ),
  },
];

export function expectedDebtBalance(debt: DebtSpec): number {
  return fromCents(
    debt.payments.reduce(
      (balance, payment) => balance - (toCents(payment.amount) - toCents(payment.interest)),
      toCents(debt.openingBalance),
    ),
  );
}

// ── Salary ───────────────────────────────────────────────────────────────────

export type EmploymentSpec = {
  key: string;
  owner: Member;
  employerName: string;
  serviceStartDate: string;
  noticePeriodMonths: number;
  currency: CurrencyCode;
  payslips: readonly {
    month: string;
    date: string;
    gross: number;
    tax: number;
    pension: number;
    net: number;
    bonus: number | null;
  }[];
};

const demoPayslip = (month: string, date: string, gross: number, tax: number, pension: number) => ({
  month,
  date,
  gross,
  tax,
  pension,
  net: fromCents(toCents(gross) - toCents(tax) - toCents(pension)),
  bonus: null,
});

const partnerPayslip = (month: string, date: string) => ({
  month,
  date,
  gross: 3900,
  tax: 780,
  pension: 195,
  net: 2925,
  bonus: null,
});

export const EMPLOYMENTS: readonly EmploymentSpec[] = [
  {
    key: 'demoJob',
    owner: 'demo',
    employerName: 'Example Employer B.V.',
    serviceStartDate: '2021-09-01',
    noticePeriodMonths: 3,
    currency: 'EUR',
    payslips: [
      demoPayslip('Jul 2025', '2025-07-25', 5000, 1310, 250),
      demoPayslip('Aug 2025', '2025-08-25', 5000, 1310, 250),
      demoPayslip('Sep 2025', '2025-09-25', 5000, 1310, 250),
      demoPayslip('Oct 2025', '2025-10-25', 5000, 1310, 250),
      demoPayslip('Nov 2025', '2025-11-25', 5000, 1310, 250),
      // December carries a bonus: the net is gross plus bonus less tax and pension.
      {
        month: 'Dec 2025',
        date: '2025-12-19',
        gross: 5250,
        tax: 1920,
        pension: 262.5,
        net: 5167.5,
        bonus: 2100,
      },
      demoPayslip('Jan 2026', '2026-01-25', 5250, 1380, 262.5),
      demoPayslip('Feb 2026', '2026-02-25', 5250, 1380, 262.5),
      demoPayslip('Mar 2026', '2026-03-25', 5250, 1380, 262.5),
      demoPayslip('Apr 2026', '2026-04-25', 5250, 1380, 262.5),
      demoPayslip('May 2026', '2026-05-25', 5250, 1380, 262.5),
      demoPayslip('Jun 2026', '2026-06-25', 5250, 1380, 262.5),
      // A pay rise from July.
      demoPayslip('Jul 2026', '2026-07-25', 5500, 1465, 275),
      demoPayslip('Aug 2026', '2026-08-25', 5500, 1465, 275),
      demoPayslip('Sep 2026', '2026-09-25', 5500, 1465, 275),
    ],
  },
  {
    key: 'partnerJob',
    owner: 'partner',
    employerName: 'Sample Studio Ltd',
    serviceStartDate: '2022-05-16',
    noticePeriodMonths: 1,
    currency: 'GBP',
    payslips: [
      partnerPayslip('Apr 2026', '2026-04-28'),
      partnerPayslip('May 2026', '2026-05-28'),
      partnerPayslip('Jun 2026', '2026-06-28'),
      partnerPayslip('Jul 2026', '2026-07-28'),
      partnerPayslip('Aug 2026', '2026-08-28'),
      partnerPayslip('Sep 2026', '2026-09-28'),
    ],
  },
];

// ── Goals ────────────────────────────────────────────────────────────────────

export type GoalSpec = {
  type: GoalType;
  name: string;
  emoji: string;
  /** Key of the savings account whose balance the goal tracks. */
  savingsAccountKey?: string;
  currentAmount: number | 'account';
  targetAmount: number;
  deadline: string;
  year: number | null;
  category: string;
  monthlyContribution: number;
  color: string;
  notes: string;
  currency: CurrencyCode;
  startMonth: string | null;
  missedMonths: readonly string[] | null;
  habit?: { monthlyTarget: number; monthsCompleted: number; totalMonths: number; unit: string };
};

export const GOALS: readonly GoalSpec[] = [
  {
    type: 'savings',
    name: 'Emergency fund',
    emoji: '🛟',
    savingsAccountKey: 'emergency',
    currentAmount: 'account',
    targetAmount: 12000,
    deadline: 'Dec 2026',
    year: 2026,
    category: 'Safety',
    monthlyContribution: 250,
    color: COLOR.income,
    notes: 'Six months of essential spending.',
    currency: 'EUR',
    startMonth: '2025-01',
    missedMonths: [],
  },
  {
    type: 'savings',
    name: 'Holiday in Japan',
    emoji: '🗾',
    currentAmount: 1850,
    targetAmount: 4500,
    deadline: 'Jun 2027',
    year: 2027,
    category: 'Lifestyle',
    monthlyContribution: 300,
    color: COLOR.milestone,
    notes: 'Flights, a rail pass and two weeks of lodging.',
    currency: 'EUR',
    startMonth: '2026-01',
    missedMonths: ['2026-03'],
  },
  {
    type: 'salary',
    name: 'Reach 72k salary',
    emoji: '💼',
    currentAmount: 66000,
    targetAmount: 72000,
    deadline: 'Dec 2026',
    year: 2026,
    category: 'Career',
    monthlyContribution: 0,
    color: COLOR.primary,
    notes: '',
    currency: 'EUR',
    startMonth: null,
    missedMonths: null,
  },
  {
    type: 'portfolio',
    name: 'Portfolio of 25k',
    emoji: '📈',
    currentAmount: 9881.44,
    targetAmount: 25000,
    deadline: 'Dec 2028',
    year: 2028,
    category: 'Wealth',
    monthlyContribution: 300,
    color: COLOR.portfolio,
    notes: '',
    currency: 'EUR',
    startMonth: null,
    missedMonths: null,
  },
  {
    type: 'invest_habit',
    name: 'Invest every month',
    emoji: '🌱',
    currentAmount: 2100,
    targetAmount: 3600,
    deadline: 'Feb 2027',
    year: 2027,
    category: 'Habit',
    monthlyContribution: 0,
    color: COLOR.recurring,
    notes: '',
    currency: 'EUR',
    startMonth: '2026-03',
    missedMonths: ['2026-06'],
    habit: { monthlyTarget: 300, monthsCompleted: 7, totalMonths: 12, unit: 'months' },
  },
];

// ── Budget ───────────────────────────────────────────────────────────────────

export type BudgetMonthSpec = { month: string; year: number; monthNumber: number; lastDay: number };

/** The budget runs from July; October stops at the as-of date. */
export const BUDGET_MONTHS: readonly BudgetMonthSpec[] = [
  { month: 'Jul', year: 2026, monthNumber: 7, lastDay: 31 },
  { month: 'Aug', year: 2026, monthNumber: 8, lastDay: 31 },
  { month: 'Sep', year: 2026, monthNumber: 9, lastDay: 30 },
  { month: 'Oct', year: 2026, monthNumber: 10, lastDay: 9 },
];

type BudgetEntrySpec = {
  day: number;
  merchant: string;
  description: string;
  cents: number;
  currency?: CurrencyCode;
};

type BudgetCategorySpec = {
  name: keyof typeof CATEGORY_PRESETS;
  budgeted: number;
  /** Months, by index into BUDGET_MONTHS, in which the category exists; all when omitted. */
  months?: readonly number[];
  /** Whether the same entry costs a little more or less each month. */
  varies: boolean;
  entries: readonly BudgetEntrySpec[];
};

// What each month adds to a varying entry, scaled by 1 to 3 across the entries of a category.
const MONTHLY_VARIATION_CENTS = [0, 425, -310, 780];

export const BUDGET_CATEGORIES: readonly BudgetCategorySpec[] = [
  {
    name: 'Groceries',
    budgeted: 520,
    varies: true,
    entries: [
      { day: 2, merchant: 'Example Market', description: 'Weekly shop', cents: 8640 },
      { day: 6, merchant: 'Bäckerei Beispiel', description: 'Bread and pastries', cents: 1420 },
      { day: 9, merchant: 'Example Market', description: 'Weekly shop', cents: 11235 },
      { day: 13, merchant: 'Fresh Corner', description: 'Vegetables and fruit', cents: 6390 },
      { day: 16, merchant: 'Example Market', description: 'Weekly shop', cents: 9875 },
      { day: 20, merchant: 'Bäckerei Beispiel', description: 'Bread and pastries', cents: 1160 },
      { day: 23, merchant: 'Example Market', description: 'Weekly shop', cents: 10410 },
      { day: 27, merchant: 'Fresh Corner', description: 'Vegetables and fruit', cents: 5480 },
    ],
  },
  {
    name: 'Restaurants & Bars',
    budgeted: 150,
    varies: true,
    entries: [
      { day: 5, merchant: 'Pizzeria Esempio', description: 'Dinner', cents: 3850 },
      { day: 12, merchant: 'Café Exemplar', description: 'Coffee and cake', cents: 1420 },
      { day: 18, merchant: 'Example Brewery', description: 'Drinks with friends', cents: 3260 },
      { day: 25, merchant: 'Sushi Sample', description: 'Dinner', cents: 4580 },
    ],
  },
  {
    name: 'Transport',
    budgeted: 120,
    varies: true,
    entries: [
      { day: 1, merchant: 'Example Transit', description: 'Monthly pass', cents: 4950 },
      { day: 8, merchant: 'Example Taxi', description: 'Late ride home', cents: 2230 },
      { day: 22, merchant: 'Example Bikes', description: 'Bike service', cents: 3980 },
    ],
  },
  {
    name: 'Utilities',
    budgeted: 210,
    varies: false,
    entries: [
      { day: 4, merchant: 'Example Energy', description: 'Electricity and gas', cents: 9400 },
      { day: 4, merchant: 'Example Water', description: 'Water', cents: 2150 },
      { day: 10, merchant: 'Example Fibre', description: 'Internet', cents: 4200 },
    ],
  },
  {
    name: 'Subscriptions',
    budgeted: 48,
    varies: false,
    entries: [
      { day: 8, merchant: 'Example Stream', description: 'Video streaming', cents: 1299 },
      { day: 8, merchant: 'Example Music', description: 'Music streaming', cents: 1099 },
      { day: 15, merchant: 'Example Cloud', description: 'Cloud storage', cents: 299 },
    ],
  },
  {
    name: 'Health',
    budgeted: 60,
    varies: true,
    entries: [
      { day: 14, merchant: 'Example Pharmacy', description: 'Pharmacy', cents: 2340 },
      { day: 21, merchant: 'Example Dental', description: 'Check-up', cents: 4000 },
    ],
  },
  {
    name: 'Entertainment',
    budgeted: 80,
    varies: true,
    entries: [
      { day: 19, merchant: 'Example Cinema', description: 'Cinema tickets', cents: 2800 },
      { day: 26, merchant: 'Example Books', description: 'Books', cents: 3150 },
    ],
  },
  {
    // Only August: a trip with two pounds-sterling payments, converted at the stored rate.
    name: 'Travel',
    budgeted: 400,
    months: [1],
    varies: false,
    entries: [
      {
        day: 12,
        merchant: 'Example Rail',
        description: 'Train to Edinburgh',
        cents: 6200,
        currency: 'GBP',
      },
      {
        day: 13,
        merchant: 'Highland Guest House',
        description: 'Two nights',
        cents: 8450,
        currency: 'GBP',
      },
      { day: 28, merchant: 'Example Air', description: 'Flight to Zürich', cents: 17840 },
    ],
  },
];

export type BudgetTransactionSpec = {
  categoryName: string;
  month: string;
  year: number;
  date: string;
  merchant: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
};

function entryCents(
  category: BudgetCategorySpec,
  entry: BudgetEntrySpec,
  entryIndex: number,
  monthIndex: number,
) {
  if (!category.varies) return entry.cents;
  return entry.cents + MONTHLY_VARIATION_CENTS[monthIndex]! * ((entryIndex % 3) + 1);
}

export function budgetCategoryMonths(category: BudgetCategorySpec): BudgetMonthSpec[] {
  return BUDGET_MONTHS.filter((_, index) => category.months?.includes(index) ?? true);
}

/** Every budget transaction in creation order: by month, then category, then entry. */
export function budgetTransactions(): BudgetTransactionSpec[] {
  return BUDGET_MONTHS.flatMap((month, monthIndex) =>
    BUDGET_CATEGORIES.filter((category) => category.months?.includes(monthIndex) ?? true).flatMap(
      (category) =>
        category.entries
          .map((entry, entryIndex) => ({ entry, entryIndex }))
          .filter(({ entry }) => entry.day <= month.lastDay)
          .map(({ entry, entryIndex }) => ({
            categoryName: category.name,
            month: month.month,
            year: month.year,
            date: `${month.year}-${String(month.monthNumber).padStart(2, '0')}-${String(entry.day).padStart(2, '0')}`,
            merchant: entry.merchant,
            description: entry.description,
            amount: fromCents(entryCents(category, entry, entryIndex, monthIndex)),
            currency: entry.currency ?? ('EUR' as const),
          })),
    ),
  );
}

// ── Users ────────────────────────────────────────────────────────────────────

export const HOUSEHOLD_EMAILS = [DEMO_USER_EMAIL, DEMO_PARTNER_EMAIL] as const;
