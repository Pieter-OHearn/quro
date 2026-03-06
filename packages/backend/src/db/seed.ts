/* eslint-disable no-magic-numbers */
import { db } from './client';
import {
  users,
  savingsAccounts,
  savingsTransactions,
  holdings,
  holdingPriceHistory,
  holdingTransactions,
  properties,
  propertyTransactions,
  pensionPots,
  pensionTransactions,
  mortgages,
  mortgageTransactions,
  payslips,
  goals,
  budgetCategories,
  budgetTransactions,
  currencyRates,
  dashboardTransactions,
} from './schema';
import { eq } from 'drizzle-orm';

// ── Helper ───────────────────────────────────────────────────────────────────

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

type SeedUser = {
  id: number;
  name: string;
  email: string;
  created: boolean;
};

const DEMO_USER_EMAIL = 'demo@quro.local';
const DEMO_USER_NAME = 'Demo User';
const DEMO_USER_PASSWORD = 'password123';

async function ensureDemoUser(): Promise<SeedUser> {
  const [existing] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, DEMO_USER_EMAIL));
  if (existing) return { ...existing, created: false };

  const passwordHash = await Bun.password.hash(DEMO_USER_PASSWORD, {
    algorithm: 'bcrypt',
    cost: 10,
  });
  const [created] = await db
    .insert(users)
    .values({
      name: DEMO_USER_NAME,
      email: DEMO_USER_EMAIL,
      passwordHash,
    })
    .returning({ id: users.id, name: users.name, email: users.email });
  return { ...created, created: true };
}

const seedUser = await ensureDemoUser();
const seedUserId = seedUser.id;
const withUser = <const T extends Record<string, unknown>>(rows: readonly T[]) =>
  rows.map((row) => ({ ...row, userId: seedUserId })) as Array<T & { userId: number }>;

console.log(`Seeding data for user ${seedUser.email} (id: ${seedUser.id})`);
if (seedUser.created)
  console.log(`Created demo user credentials: ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);

// ── Clear all tables (child tables first) ────────────────────────────────────

console.log('Clearing existing data...');
await db.delete(budgetTransactions);
await db.delete(budgetCategories);
await db.delete(dashboardTransactions);
await db.delete(currencyRates);
await db.delete(savingsTransactions);
await db.delete(savingsAccounts);
await db.delete(holdingTransactions);
await db.delete(holdingPriceHistory);
await db.delete(holdings);
await db.delete(propertyTransactions);
await db.delete(properties);
await db.delete(pensionTransactions);
await db.delete(pensionPots);
await db.delete(mortgageTransactions);
await db.delete(mortgages);
await db.delete(payslips);
await db.delete(goals);
console.log('All tables cleared.');

// ── Savings Accounts ─────────────────────────────────────────────────────────

console.log('Seeding savings accounts...');
const insertedSavingsAccounts = await db
  .insert(savingsAccounts)
  .values(
    withUser([
      {
        name: 'ASN Bank Spaarrekening',
        bank: 'ASN Bank',
        balance: '18500',
        currency: 'EUR',
        interestRate: '3.25',
        accountType: 'Easy Access',
        color: '#6366f1',
        emoji: '\u{1F1F3}\u{1F1F1}',
      },
      {
        name: 'Rabobank Direct Sparen',
        bank: 'Rabobank',
        balance: '14000',
        currency: 'EUR',
        interestRate: '3.50',
        accountType: 'Easy Access',
        color: '#0ea5e9',
        emoji: '\u{1F3E6}',
      },
      {
        name: 'ING Oranje Spaarrekening',
        bank: 'ING',
        balance: '6500',
        currency: 'EUR',
        interestRate: '2.75',
        accountType: 'Easy Access',
        color: '#10b981',
        emoji: '\u{1F7E0}',
      },
      {
        name: 'CommBank NetBank Saver',
        bank: 'CommBank',
        balance: '12000',
        currency: 'AUD',
        interestRate: '4.80',
        accountType: 'Easy Access',
        color: '#f59e0b',
        emoji: '\u{1F1E6}\u{1F1FA}',
      },
      {
        name: 'ING Savings Maximiser',
        bank: 'ING Australia',
        balance: '8500',
        currency: 'AUD',
        interestRate: '5.50',
        accountType: 'Easy Access',
        color: '#f97316',
        emoji: '\u{1F4B0}',
      },
    ]),
  )
  .returning();

const saIds = insertedSavingsAccounts.map((a) => a.id);

// ── Savings Transactions ─────────────────────────────────────────────────────

console.log('Seeding savings transactions...');

const months = [
  { year: 2025, month: 8 },
  { year: 2025, month: 9 },
  { year: 2025, month: 10 },
  { year: 2025, month: 11 },
  { year: 2025, month: 12 },
  { year: 2026, month: 1 },
  { year: 2026, month: 2 },
];

const accountMonthly = [
  { deposit: 800, interest: 50 },
  { deposit: 600, interest: 41 },
  { deposit: 400, interest: 15 },
  { deposit: 500, interest: 48 },
  { deposit: 300, interest: 39 },
];

const savTxRows: Array<{
  accountId: number;
  type: string;
  amount: string;
  date: string;
  note: string | null;
}> = [];

for (const m of months) {
  for (let i = 0; i < 5; i++) {
    const datePrefix = `${m.year}-${pad(m.month)}`;
    savTxRows.push({
      accountId: saIds[i],
      type: 'deposit',
      amount: accountMonthly[i].deposit.toString(),
      date: `${datePrefix}-05`,
      note: 'Monthly deposit',
    });
    savTxRows.push({
      accountId: saIds[i],
      type: 'interest',
      amount: accountMonthly[i].interest.toString(),
      date: `${datePrefix}-28`,
      note: 'Monthly interest',
    });
  }
}

// Extra: Account 3 withdrawal
savTxRows.push({
  accountId: saIds[2],
  type: 'withdrawal',
  amount: '1200',
  date: '2025-10-12',
  note: 'Car repair',
});

// Extra: Account 5 withdrawal
savTxRows.push({
  accountId: saIds[4],
  type: 'withdrawal',
  amount: '600',
  date: '2025-12-20',
  note: 'Holiday spending',
});

await db.insert(savingsTransactions).values(withUser(savTxRows));

// ── Holdings ─────────────────────────────────────────────────────────────────

console.log('Seeding holdings...');
const insertedHoldings = await db
  .insert(holdings)
  .values(
    withUser([
      {
        name: 'Vanguard FTSE All-World',
        ticker: 'VWCE',
        currentPrice: '112.50',
        currency: 'EUR',
        sector: 'ETF',
      },
      {
        name: 'iShares MSCI World ESG',
        ticker: 'SUSW',
        currentPrice: '71.30',
        currency: 'EUR',
        sector: 'ETF',
      },
      {
        name: 'Apple Inc.',
        ticker: 'AAPL',
        currentPrice: '182.30',
        currency: 'USD',
        sector: 'Tech',
      },
      {
        name: 'NVIDIA Corp',
        ticker: 'NVDA',
        currentPrice: '875.00',
        currency: 'USD',
        sector: 'Tech',
      },
      {
        name: 'Vanguard Australia Shares',
        ticker: 'VAS',
        currentPrice: '112.50',
        currency: 'AUD',
        sector: 'ETF',
      },
      {
        name: 'Commonwealth Bank',
        ticker: 'CBA',
        currentPrice: '155.20',
        currency: 'AUD',
        sector: 'Finance',
      },
    ]),
  )
  .returning();

const hIds = insertedHoldings.map((h) => h.id);

// ── Holding Transactions ─────────────────────────────────────────────────────

console.log('Seeding holding transactions...');
await db.insert(holdingTransactions).values(
  withUser([
    // VWCE
    {
      holdingId: hIds[0],
      type: 'buy',
      shares: '50',
      price: '94.50',
      date: '2025-03-10',
      note: null,
    },
    {
      holdingId: hIds[0],
      type: 'buy',
      shares: '35',
      price: '103.49',
      date: '2025-10-14',
      note: null,
    },
    // SUSW
    {
      holdingId: hIds[1],
      type: 'buy',
      shares: '80',
      price: '54.00',
      date: '2025-04-08',
      note: null,
    },
    {
      holdingId: hIds[1],
      type: 'buy',
      shares: '40',
      price: '66.30',
      date: '2025-11-03',
      note: null,
    },
    // AAPL
    {
      holdingId: hIds[2],
      type: 'buy',
      shares: '15',
      price: '142.00',
      date: '2025-02-18',
      note: null,
    },
    {
      holdingId: hIds[2],
      type: 'buy',
      shares: '10',
      price: '158.25',
      date: '2025-09-10',
      note: null,
    },
    {
      holdingId: hIds[2],
      type: 'dividend',
      shares: null,
      price: '3.75',
      date: '2025-06-20',
      note: null,
    },
    {
      holdingId: hIds[2],
      type: 'dividend',
      shares: null,
      price: '6.25',
      date: '2025-12-18',
      note: null,
    },
    // NVDA
    {
      holdingId: hIds[3],
      type: 'buy',
      shares: '15',
      price: '380.00',
      date: '2024-11-12',
      note: null,
    },
    {
      holdingId: hIds[3],
      type: 'sell',
      shares: '3',
      price: '620.00',
      date: '2025-05-22',
      note: null,
    },
    // VAS
    {
      holdingId: hIds[4],
      type: 'buy',
      shares: '120',
      price: '95.50',
      date: '2025-01-08',
      note: null,
    },
    {
      holdingId: hIds[4],
      type: 'buy',
      shares: '80',
      price: '103.00',
      date: '2025-08-12',
      note: null,
    },
    {
      holdingId: hIds[4],
      type: 'dividend',
      shares: null,
      price: '72',
      date: '2025-03-28',
      note: null,
    },
    {
      holdingId: hIds[4],
      type: 'dividend',
      shares: null,
      price: '72',
      date: '2025-06-28',
      note: null,
    },
    {
      holdingId: hIds[4],
      type: 'dividend',
      shares: null,
      price: '120',
      date: '2025-09-28',
      note: null,
    },
    {
      holdingId: hIds[4],
      type: 'dividend',
      shares: null,
      price: '120',
      date: '2025-12-28',
      note: null,
    },
    // CBA
    {
      holdingId: hIds[5],
      type: 'buy',
      shares: '30',
      price: '125.00',
      date: '2025-02-25',
      note: null,
    },
    {
      holdingId: hIds[5],
      type: 'buy',
      shares: '20',
      price: '138.00',
      date: '2025-09-15',
      note: null,
    },
    {
      holdingId: hIds[5],
      type: 'dividend',
      shares: null,
      price: '75',
      date: '2025-06-15',
      note: null,
    },
    {
      holdingId: hIds[5],
      type: 'dividend',
      shares: null,
      price: '125',
      date: '2025-12-15',
      note: null,
    },
  ]),
);

// ── Properties ───────────────────────────────────────────────────────────────

console.log('Seeding properties...');
const insertedProperties = await db
  .insert(properties)
  .values(
    withUser([
      {
        address: 'Prinsengracht 42, Amsterdam',
        propertyType: 'Primary Residence',
        purchasePrice: '310000',
        currentValue: '362000',
        mortgage: '220000',
        monthlyRent: '1850',
        currency: 'EUR',
        emoji: '\u{1F1F3}\u{1F1F1}',
      },
      {
        address: '14 Bondi Road, Sydney NSW',
        propertyType: 'Buy-to-Let',
        purchasePrice: '580000',
        currentValue: '645000',
        mortgage: '420000',
        monthlyRent: '2200',
        currency: 'AUD',
        emoji: '\u{1F1E6}\u{1F1FA}',
      },
    ]),
  )
  .returning();

const propIds = insertedProperties.map((p) => p.id);

// ── Property Transactions ────────────────────────────────────────────────────

console.log('Seeding property transactions...');

// Amsterdam: 6 monthly repayments + 1 valuation
const amInterests = [688, 686, 684, 682, 678, 674];
const amPrincipals = [592, 594, 596, 598, 602, 606];
const propTxMonths = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'];

const propTxRows: Array<{
  propertyId: number;
  type: string;
  amount: string;
  interest: string | null;
  principal: string | null;
  date: string;
  note: string | null;
}> = [];

for (let i = 0; i < 6; i++) {
  propTxRows.push({
    propertyId: propIds[0],
    type: 'repayment',
    amount: '1280',
    interest: amInterests[i].toString(),
    principal: amPrincipals[i].toString(),
    date: `${propTxMonths[i]}-01`,
    note: 'Monthly mortgage repayment',
  });
}

propTxRows.push({
  propertyId: propIds[0],
  type: 'valuation',
  amount: '365000',
  interest: null,
  principal: null,
  date: '2025-11-15',
  note: 'Annual property valuation',
});

// Sydney: 6 monthly repayments + rental cashflow + 1 valuation
const syInterests = [1395, 1392, 1389, 1386, 1383, 1379];
const syPrincipals = [755, 758, 761, 764, 767, 771];

for (let i = 0; i < 6; i++) {
  propTxRows.push({
    propertyId: propIds[1],
    type: 'repayment',
    amount: '2150',
    interest: syInterests[i].toString(),
    principal: syPrincipals[i].toString(),
    date: `${propTxMonths[i]}-01`,
    note: 'Monthly mortgage repayment',
  });
  propTxRows.push({
    propertyId: propIds[1],
    type: 'rent_income',
    amount: '2200',
    interest: null,
    principal: null,
    date: `${propTxMonths[i]}-03`,
    note: 'Monthly rent received',
  });
  if (i % 2 === 0) {
    propTxRows.push({
      propertyId: propIds[1],
      type: 'expense',
      amount: '325',
      interest: null,
      principal: null,
      date: `${propTxMonths[i]}-18`,
      note: 'Maintenance and repairs',
    });
  }
}

propTxRows.push({
  propertyId: propIds[1],
  type: 'valuation',
  amount: '648000',
  interest: null,
  principal: null,
  date: '2025-12-01',
  note: 'Annual property valuation',
});

await db.insert(propertyTransactions).values(withUser(propTxRows));

// ── Pension Pots ─────────────────────────────────────────────────────────────

console.log('Seeding pension pots...');
const insertedPensions = await db
  .insert(pensionPots)
  .values(
    withUser([
      {
        name: 'ABP Werknemerspensioen',
        provider: 'ABP',
        type: 'Workplace',
        balance: '47030',
        currency: 'EUR',
        employeeMonthly: '325',
        employerMonthly: '195',
        color: '#6366f1',
        emoji: '\u{1F1F3}\u{1F1F1}',
        notes: null,
      },
      {
        name: 'Australian Superannuation',
        provider: 'Australian Super',
        type: 'Superannuation',
        balance: '71050',
        currency: 'AUD',
        employeeMonthly: '500',
        employerMonthly: '725',
        color: '#f59e0b',
        emoji: '\u{1F1E6}\u{1F1FA}',
        notes: null,
      },
      {
        name: 'Self-Invested Pension',
        provider: 'DeGiro',
        type: 'SIPP',
        balance: '17430',
        currency: 'EUR',
        employeeMonthly: '200',
        employerMonthly: '0',
        color: '#0ea5e9',
        emoji: '\u{1F4CA}',
        notes: null,
      },
    ]),
  )
  .returning();

const penIds = insertedPensions.map((p) => p.id);

// ── Pension Transactions ─────────────────────────────────────────────────────

console.log('Seeding pension transactions...');

const penTxRows: Array<{
  potId: number;
  type: string;
  amount: string;
  date: string;
  note: string | null;
  isEmployer: boolean | null;
}> = [];

// ABP: 6 months employee + employer + 1 fee
for (const m of propTxMonths) {
  penTxRows.push({
    potId: penIds[0],
    type: 'contribution',
    amount: '325',
    date: `${m}-25`,
    note: 'Employee contribution',
    isEmployer: false,
  });
  penTxRows.push({
    potId: penIds[0],
    type: 'contribution',
    amount: '195',
    date: `${m}-25`,
    note: 'Employer contribution',
    isEmployer: true,
  });
}
penTxRows.push({
  potId: penIds[0],
  type: 'fee',
  amount: '45',
  date: '2025-12-31',
  note: 'Annual management fee',
  isEmployer: null,
});

// AustralianSuper: 6 months employee + employer + 1 fee
for (const m of propTxMonths) {
  penTxRows.push({
    potId: penIds[1],
    type: 'contribution',
    amount: '500',
    date: `${m}-25`,
    note: 'Employee contribution',
    isEmployer: false,
  });
  penTxRows.push({
    potId: penIds[1],
    type: 'contribution',
    amount: '725',
    date: `${m}-25`,
    note: 'Employer contribution',
    isEmployer: true,
  });
}
penTxRows.push({
  potId: penIds[1],
  type: 'fee',
  amount: '120',
  date: '2025-12-31',
  note: 'Annual management fee',
  isEmployer: null,
});

// DeGiro: 6 months employee + 1 fee
for (const m of propTxMonths) {
  penTxRows.push({
    potId: penIds[2],
    type: 'contribution',
    amount: '200',
    date: `${m}-25`,
    note: 'Employee contribution',
    isEmployer: false,
  });
}
penTxRows.push({
  potId: penIds[2],
  type: 'fee',
  amount: '15',
  date: '2025-12-31',
  note: 'Annual management fee',
  isEmployer: null,
});

await db.insert(pensionTransactions).values(withUser(penTxRows));

// ── Mortgages ────────────────────────────────────────────────────────────────

console.log('Seeding mortgages...');
const insertedMortgages = await db
  .insert(mortgages)
  .values(
    withUser([
      {
        propertyAddress: 'Prinsengracht 42, Amsterdam',
        lender: 'ABN AMRO',
        currency: 'EUR',
        originalAmount: '240000',
        outstandingBalance: '218600',
        propertyValue: '362000',
        monthlyPayment: '1280',
        interestRate: '4.25',
        rateType: 'Fixed',
        fixedUntil: '2027-03-01',
        termYears: 25,
        startDate: '2022-03-01',
        endDate: '2047-03-01',
        overpaymentLimit: '10',
      },
    ]),
  )
  .returning();

const mortId = insertedMortgages[0].id;

await db.update(properties).set({ mortgageId: mortId }).where(eq(properties.id, propIds[0]));

// ── Mortgage Transactions ────────────────────────────────────────────────────

console.log('Seeding mortgage transactions...');

const mortTxRows: Array<{
  mortgageId: number;
  type: string;
  amount: string;
  interest: string | null;
  principal: string | null;
  date: string;
  note: string | null;
  fixedYears: string | null;
}> = [];

for (let i = 0; i < 6; i++) {
  mortTxRows.push({
    mortgageId: mortId,
    type: 'repayment',
    amount: '1280',
    interest: amInterests[i].toString(),
    principal: amPrincipals[i].toString(),
    date: `${propTxMonths[i]}-01`,
    note: 'Monthly repayment',
    fixedYears: null,
  });
}

mortTxRows.push({
  mortgageId: mortId,
  type: 'valuation',
  amount: '365000',
  interest: null,
  principal: null,
  date: '2025-11-15',
  note: 'Annual property valuation',
  fixedYears: null,
});

mortTxRows.push({
  mortgageId: mortId,
  type: 'rate_change',
  amount: '4.25',
  interest: null,
  principal: null,
  date: '2026-01-15',
  note: 'Fixed rate renewal',
  fixedYears: '2',
});

await db.insert(mortgageTransactions).values(withUser(mortTxRows));

// ── Payslips ─────────────────────────────────────────────────────────────────

console.log('Seeding payslips...');
await db.insert(payslips).values(
  withUser([
    {
      month: 'February 2026',
      date: '2026-02-25',
      gross: '6500',
      tax: '1680',
      pension: '325',
      net: '4495',
      bonus: null,
      currency: 'EUR',
    },
    {
      month: 'January 2026',
      date: '2026-01-25',
      gross: '6500',
      tax: '1680',
      pension: '325',
      net: '4495',
      bonus: null,
      currency: 'EUR',
    },
    {
      month: 'December 2025',
      date: '2025-12-25',
      gross: '7800',
      tax: '2080',
      pension: '390',
      net: '6630',
      bonus: '1300',
      currency: 'EUR',
    },
    {
      month: 'November 2025',
      date: '2025-11-25',
      gross: '6500',
      tax: '1680',
      pension: '325',
      net: '4495',
      bonus: null,
      currency: 'EUR',
    },
    {
      month: 'October 2025',
      date: '2025-10-25',
      gross: '6500',
      tax: '1680',
      pension: '325',
      net: '4495',
      bonus: null,
      currency: 'EUR',
    },
    {
      month: 'September 2025',
      date: '2025-09-25',
      gross: '6500',
      tax: '1680',
      pension: '325',
      net: '4495',
      bonus: null,
      currency: 'EUR',
    },
  ]),
);

// ── Goals ────────────────────────────────────────────────────────────────────

console.log('Seeding goals...');
await db.insert(goals).values(
  withUser([
    // savings
    {
      type: 'savings',
      name: 'Emergency Fund',
      emoji: '\u{1F6E1}\u{FE0F}',
      currentAmount: '12500',
      targetAmount: '15600',
      deadline: '2026-06-30',
      year: 2026,
      category: 'Savings',
      monthlyContribution: '500',
      color: '#6366f1',
      notes: '3 months of expenses as backup',
      currency: 'EUR',
    },
    {
      type: 'savings',
      name: 'Japan Trip',
      emoji: '\u{2708}\u{FE0F}',
      currentAmount: '2800',
      targetAmount: '4000',
      deadline: '2026-07-31',
      year: 2026,
      category: 'Savings',
      monthlyContribution: '300',
      color: '#0ea5e9',
      notes: 'Tokyo and Kyoto summer holiday',
      currency: 'EUR',
    },
    // salary
    {
      type: 'salary',
      name: 'Hit EUR 90k Gross Salary',
      emoji: '\u{1F4BC}',
      currentAmount: '78000',
      targetAmount: '90000',
      deadline: '2026-12-31',
      year: 2026,
      category: 'Career',
      monthlyContribution: '0',
      color: '#10b981',
      notes: 'Target via promotion or raise negotiation',
      currency: 'EUR',
    },
    // invest_habit
    {
      type: 'invest_habit',
      name: 'EUR 500/mo into VWCE ETF',
      emoji: '\u{1F4C8}',
      currentAmount: '1000',
      targetAmount: '6000',
      deadline: '2026-12-31',
      year: 2026,
      category: 'Investing',
      monthlyContribution: '0',
      monthlyTarget: '500',
      monthsCompleted: 2,
      totalMonths: 12,
      color: '#6366f1',
      notes: 'Consistent DCA every month',
      currency: 'EUR',
    },
    // portfolio
    {
      type: 'portfolio',
      name: 'Brokerage Hits EUR 75k',
      emoji: '\u{1F4CA}',
      currentAmount: '52700',
      targetAmount: '75000',
      deadline: '2026-12-31',
      year: 2026,
      category: 'Investing',
      monthlyContribution: '0',
      color: '#0ea5e9',
      notes: 'ETF-heavy long-term portfolio',
      currency: 'EUR',
    },
    // net_worth
    {
      type: 'net_worth',
      name: 'Reach EUR 500k Net Worth',
      emoji: '\u{1F3C6}',
      currentAmount: '445000',
      targetAmount: '500000',
      deadline: '2026-12-31',
      year: 2026,
      category: 'Wealth',
      monthlyContribution: '0',
      color: '#ec4899',
      notes: 'Property equity + pensions + savings + brokerage',
      currency: 'EUR',
    },
    // annual
    {
      type: 'annual',
      name: 'Read 4 Finance Books',
      emoji: '\u{1F4DA}',
      currentAmount: '1',
      targetAmount: '4',
      deadline: '2026-12-31',
      year: 2026,
      category: 'Annual',
      monthlyContribution: '0',
      unit: 'books',
      color: '#a78bfa',
      notes: 'Currently reading The Psychology of Money',
      currency: 'EUR',
    },
    {
      type: 'annual',
      name: 'Reduce Dining Out below EUR 150/mo',
      emoji: '\u{1F37D}\u{FE0F}',
      currentAmount: '187',
      targetAmount: '150',
      deadline: '2026-12-31',
      year: 2026,
      category: 'Annual',
      monthlyContribution: '0',
      unit: '€/mo',
      color: '#f97316',
      notes: 'Track via budget page and keep trend down',
      currency: 'EUR',
    },
    // completed prior year examples
    {
      type: 'savings',
      name: 'Australia Holiday Fund',
      emoji: '\u{1F334}',
      currentAmount: '5000',
      targetAmount: '5000',
      deadline: '2025-12-31',
      year: 2025,
      category: 'Savings',
      monthlyContribution: '400',
      color: '#10b981',
      notes: 'Completed in 2025',
      currency: 'EUR',
    },
    {
      type: 'invest_habit',
      name: 'EUR 300/mo into Super',
      emoji: '\u{1F1E6}\u{1F1FA}',
      currentAmount: '3600',
      targetAmount: '3600',
      deadline: '2025-12-31',
      year: 2025,
      category: 'Investing',
      monthlyContribution: '0',
      monthlyTarget: '300',
      monthsCompleted: 12,
      totalMonths: 12,
      color: '#f59e0b',
      notes: 'Completed monthly contribution streak',
      currency: 'EUR',
    },
  ]),
);

// ── Budget Categories ────────────────────────────────────────────────────────

console.log('Seeding budget categories...');
const insertedBudgetCats = await db
  .insert(budgetCategories)
  .values(
    withUser([
      {
        name: 'Housing',
        emoji: '\u{1F3E0}',
        budgeted: '1450',
        spent: '1450',
        color: '#6366f1',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Food & Groceries',
        emoji: '\u{1F6D2}',
        budgeted: '500',
        spent: '412',
        color: '#0ea5e9',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Transport',
        emoji: '\u{1F687}',
        budgeted: '250',
        spent: '198',
        color: '#f59e0b',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Utilities',
        emoji: '\u{1F4A1}',
        budgeted: '180',
        spent: '167',
        color: '#10b981',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Entertainment',
        emoji: '\u{1F3AC}',
        budgeted: '200',
        spent: '238',
        color: '#f97316',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Dining Out',
        emoji: '\u{1F37D}\u{FE0F}',
        budgeted: '150',
        spent: '187',
        color: '#ec4899',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Health & Fitness',
        emoji: '\u{1F4AA}',
        budgeted: '100',
        spent: '89',
        color: '#14b8a6',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Clothing',
        emoji: '\u{1F457}',
        budgeted: '100',
        spent: '0',
        color: '#8b5cf6',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Savings & Investing',
        emoji: '\u{1F4B0}',
        budgeted: '1500',
        spent: '1500',
        color: '#06b6d4',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Personal Care',
        emoji: '\u{1F9F4}',
        budgeted: '60',
        spent: '45',
        color: '#a78bfa',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Subscriptions',
        emoji: '\u{1F4F1}',
        budgeted: '80',
        spent: '77',
        color: '#fb7185',
        month: 'February',
        year: 2026,
      },
      {
        name: 'Other',
        emoji: '\u{1F4E6}',
        budgeted: '200',
        spent: '124',
        color: '#94a3b8',
        month: 'February',
        year: 2026,
      },
    ]),
  )
  .returning();

const catMap: Record<string, number> = {};
for (const cat of insertedBudgetCats) {
  catMap[cat.name] = cat.id;
}

// ── Budget Transactions ──────────────────────────────────────────────────────

console.log('Seeding budget transactions...');
await db.insert(budgetTransactions).values(
  withUser([
    {
      categoryId: catMap['Food & Groceries'],
      description: 'Weekly shop',
      amount: '67.42',
      date: '2026-02-22',
      merchant: 'Tesco Metro',
    },
    {
      categoryId: catMap['Subscriptions'],
      description: 'Streaming',
      amount: '15.99',
      date: '2026-02-22',
      merchant: 'Netflix',
    },
    {
      categoryId: catMap['Health & Fitness'],
      description: 'Monthly membership',
      amount: '45.00',
      date: '2026-02-21',
      merchant: 'Gym Membership',
    },
    {
      categoryId: catMap['Transport'],
      description: 'Ride',
      amount: '12.50',
      date: '2026-02-20',
      merchant: 'Uber',
    },
    {
      categoryId: catMap['Dining Out'],
      description: 'Dinner',
      amount: '38.90',
      date: '2026-02-19',
      merchant: 'Wagamama',
    },
    {
      categoryId: catMap['Other'],
      description: 'Online order',
      amount: '23.99',
      date: '2026-02-18',
      merchant: 'Amazon',
    },
    {
      categoryId: catMap['Subscriptions'],
      description: 'Music',
      amount: '11.99',
      date: '2026-02-18',
      merchant: 'Spotify',
    },
    {
      categoryId: catMap['Food & Groceries'],
      description: 'Grocery run',
      amount: '89.30',
      date: '2026-02-17',
      merchant: "Sainsbury's",
    },
  ]),
);

// ── Currency Rates ───────────────────────────────────────────────────────────

console.log('Seeding currency rates...');
const now = new Date().toISOString();
await db.insert(currencyRates).values([
  { fromCurrency: 'EUR', toCurrency: 'EUR', rate: '1.0', updatedAt: now },
  { fromCurrency: 'GBP', toCurrency: 'EUR', rate: '1.18', updatedAt: now },
  { fromCurrency: 'USD', toCurrency: 'EUR', rate: '0.922', updatedAt: now },
  { fromCurrency: 'AUD', toCurrency: 'EUR', rate: '0.6', updatedAt: now },
  { fromCurrency: 'NZD', toCurrency: 'EUR', rate: '0.551', updatedAt: now },
  { fromCurrency: 'CAD', toCurrency: 'EUR', rate: '0.66', updatedAt: now },
  { fromCurrency: 'CHF', toCurrency: 'EUR', rate: '1.046', updatedAt: now },
  { fromCurrency: 'SGD', toCurrency: 'EUR', rate: '0.68', updatedAt: now },
]);

// ── Dashboard Transactions ───────────────────────────────────────────────────

console.log('Seeding dashboard transactions...');
await db.insert(dashboardTransactions).values(
  withUser([
    {
      name: 'Monthly Salary',
      type: 'income',
      amount: '6500',
      date: '2026-02-20',
      category: 'Salary',
    },
    {
      name: 'Mortgage Payment',
      type: 'expense',
      amount: '-1450',
      date: '2026-02-18',
      category: 'Mortgage',
    },
    {
      name: 'Grocery Shop',
      type: 'expense',
      amount: '-147.3',
      date: '2026-02-17',
      category: 'Food',
    },
    {
      name: 'ASN Bank Top-up',
      type: 'transfer',
      amount: '-500',
      date: '2026-02-15',
      category: 'Savings',
    },
    {
      name: 'VWCE Dividend',
      type: 'income',
      amount: '218.5',
      date: '2026-02-14',
      category: 'Investment',
    },
    {
      name: 'Electricity Bill',
      type: 'expense',
      amount: '-89.2',
      date: '2026-02-12',
      category: 'Utilities',
    },
  ]),
);

// ── Done ─────────────────────────────────────────────────────────────────────

console.log('Seed complete!');
process.exit(0);
