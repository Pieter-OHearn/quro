import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { toCents, toIsoDate, type DashboardAllocationsSummary } from '@quro/shared';
import { db } from '../db/client';
import { holdings, netWorthSnapshots } from '../db/schema';
import { upsertCurrentNetWorthSnapshot } from '../lib/netWorth';
import { invalidateCurrentCurrencyRateCache } from '../lib/currencyRateSync';
import { FIXTURE_RATES_TO_EUR, useFixtureCurrencyRates } from '../test/currencyRates';
import { createIntegrationHelpers, insertPartnerLink, type AuthSession } from '../test/integration';

// Golden household: two partners, mixed currencies, private and joint rows on both sides, a
// joint home with a linked mortgage, holdings, pensions and debts. Every figure below is worked
// out by hand from the fixture FX rates (GBP 1.18, USD 0.92) and the 50% joint share, then
// checked three independent ways: the dashboard API, the totals a client derives from the list
// endpoints its pages load, and the same aggregate computed in SQL from the stored rows.

const integration = createIntegrationHelpers('household-reconciliation.integration.quro.test');
const DAY_MS = 86_400_000;
// Recent dates keep every row inside any default list window.
const DATE = toIsoDate(new Date(Date.now() - 2 * DAY_MS));
const JOINT_SHARE = 0.5;

type Components = {
  savings: number;
  brokerage: number;
  propertyEquity: number;
  pension: number;
  liabilities: number;
};

type Household = {
  owner: AuthSession;
  partner: AuthSession;
  ownerPrivateEur: number;
  partnerJointEur: number;
  mortgageId: number;
};

const netWorth = (c: Components) =>
  c.savings + c.brokerage + c.propertyEquity + c.pension - c.liabilities;

// Owner: EUR 10,000 private + half of GBP 4,000 joint (2,360) + half of EUR 6,000 joint (3,000);
// 12 net shares at USD 50 (552); half of 400,000 - 250,000 equity; EUR 30,000 pension; EUR 1,500 card.
const OWNER_BASELINE: Components = {
  savings: 15_360,
  brokerage: 552,
  propertyEquity: 75_000,
  pension: 30_000,
  liabilities: 1_500,
};
// Partner: USD 2,500 private (2,300) + the same joint halves; GBP 10,000 pension (11,800);
// EUR 8,000 car loan. The owner never sees the partner's private rows.
const PARTNER_BASELINE: Components = {
  savings: 7_660,
  brokerage: 0,
  propertyEquity: 75_000,
  pension: 11_800,
  liabilities: 8_000,
};

beforeAll(async () => {
  await integration.cleanup();
  await useFixtureCurrencyRates('household-reconciliation');
  invalidateCurrentCurrencyRateCache();
});
afterAll(() => integration.cleanup());

async function read<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  return ((await response.json()) as { data: T }).data;
}

function send(session: AuthSession, method: string, path: string, json?: unknown) {
  return integration.request(path, { method, cookie: session.cookie, json });
}

const create = async <T = { id: number }>(session: AuthSession, path: string, json: unknown) =>
  read<T>(await send(session, 'POST', path, json), 201);

const get = async <T>(session: AuthSession, path: string) =>
  read<T>(await send(session, 'GET', path));

function rate(currency: string): number {
  return currency === 'EUR'
    ? 1
    : FIXTURE_RATES_TO_EUR[currency as keyof typeof FIXTURE_RATES_TO_EUR];
}

const share = (isJoint: boolean) => (isJoint ? JOINT_SHARE : 1);

function savingsAccount(
  session: AuthSession,
  name: string,
  balance: number,
  currency: string,
  isJoint: boolean,
) {
  return create(session, '/api/savings/accounts', {
    name,
    bank: 'Synthetic Bank',
    balance,
    currency,
    interestRate: 1,
    accountType: 'Easy Access',
    color: '#0ea5e9',
    emoji: 'S',
    isJoint,
  });
}

async function seedHousehold(): Promise<Household> {
  const owner = await integration.signUp('owner');
  const partner = await integration.signUp('partner');
  await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');

  const ownerPrivateEur = await savingsAccount(owner, 'Owner EUR', 10_000, 'EUR', false);
  await savingsAccount(owner, 'Joint GBP', 4_000, 'GBP', true);
  await savingsAccount(partner, 'Partner USD', 2_500, 'USD', false);
  const partnerJointEur = await savingsAccount(partner, 'Joint EUR', 6_000, 'EUR', true);

  const holding = await create(owner, '/api/investments/holdings', {
    name: 'Synthetic Index',
    ticker: 'SYNIDX',
    currentPrice: 50,
    currency: 'USD',
    sector: 'Index',
    excludeFromSync: true,
  });
  for (const [type, shares] of [
    ['buy', 10],
    ['buy', 5],
    ['sell', 3],
  ] as const) {
    await create(owner, '/api/investments/holding-transactions', {
      holdingId: holding.id,
      type,
      shares,
      price: 40,
      date: DATE,
    });
  }

  const home = await create(owner, '/api/investments/properties', {
    address: '1 Golden Lane',
    propertyType: 'primary_home',
    purchasePrice: 350_000,
    currentValue: 400_000,
    monthlyRent: 0,
    currency: 'EUR',
    emoji: 'H',
    isJoint: true,
  });
  const mortgage = await create(owner, '/api/mortgages', {
    linkedPropertyId: home.id,
    lender: 'Synthetic Lender',
    originalAmount: 300_000,
    outstandingBalance: 250_000,
    propertyValue: 400_000,
    monthlyPayment: 1_500,
    interestRate: 3,
    rateType: 'fixed',
    fixedUntil: '2031-01-01',
    termYears: 30,
    startDate: '2021-01-01',
    endDate: '2051-01-01',
  });

  const pot = (session: AuthSession, balance: number, currency: string) =>
    create(session, '/api/pensions/pots', {
      name: 'Pension',
      provider: 'Synthetic Provider',
      type: 'Workplace Pension',
      balance,
      currency,
      employeeMonthly: 0,
      employerMonthly: 0,
      investmentStrategy: 'Balanced',
      color: '#1d4ed8',
      emoji: 'P',
    });
  await pot(owner, 30_000, 'EUR');
  await pot(partner, 10_000, 'GBP');

  const debt = (session: AuthSession, name: string, type: string, balance: number) =>
    create(session, '/api/debts', {
      name,
      type,
      lender: 'Synthetic Lender',
      originalAmount: balance,
      remainingBalance: balance,
      currency: 'EUR',
      interestRate: 5,
      monthlyPayment: 100,
      startDate: '2026-01-01',
      color: '#ef4444',
      emoji: 'D',
    });
  await debt(owner, 'Card', 'credit_card', 1_500);
  await debt(partner, 'Car', 'car_loan', 8_000);

  return {
    owner,
    partner,
    ownerPrivateEur: ownerPrivateEur.id,
    partnerJointEur: partnerJointEur.id,
    mortgageId: mortgage.id,
  };
}

// What a client derives from the rows its pages list, applying the documented share and FX rule.
async function pageTotals(session: AuthSession): Promise<Components> {
  type Money = { currency: string };
  const accounts = await get<Array<Money & { balance: number; isJoint: boolean }>>(
    session,
    '/api/savings/accounts',
  );
  const holdings = await get<Array<Money & { id: number; currentPrice: number }>>(
    session,
    '/api/investments/holdings',
  );
  let brokerage = 0;
  for (const holding of holdings) {
    const txns = await get<Array<{ type: string; shares: number }>>(
      session,
      `/api/investments/holding-transactions?holdingId=${holding.id}`,
    );
    const shares = txns.reduce(
      (sum, txn) => sum + (txn.type === 'buy' ? txn.shares : txn.type === 'sell' ? -txn.shares : 0),
      0,
    );
    brokerage += Math.max(0, shares) * holding.currentPrice * rate(holding.currency);
  }
  const homes = await get<
    Array<Money & { currentValue: number; mortgage: number; isJoint: boolean }>
  >(session, '/api/investments/properties');
  const pots = await get<Array<Money & { balance: number }>>(session, '/api/pensions/pots');
  const debts = await get<Array<Money & { remainingBalance: number }>>(session, '/api/debts');
  return {
    savings: accounts.reduce(
      (sum, row) => sum + row.balance * share(row.isJoint) * rate(row.currency),
      0,
    ),
    brokerage,
    propertyEquity: homes.reduce(
      (sum, row) =>
        sum + (row.currentValue - row.mortgage) * share(row.isJoint) * rate(row.currency),
      0,
    ),
    pension: pots.reduce((sum, row) => sum + row.balance * rate(row.currency), 0),
    liabilities: debts.reduce((sum, row) => sum + row.remainingBalance * rate(row.currency), 0),
  };
}

// The same aggregate in exact numeric arithmetic, straight from the stored rows.
async function databaseTotals(userId: number, partnerId: number): Promise<Components> {
  const rates = sql`(select from_currency::text as currency, rate from currency_rates
    where to_currency = 'EUR' union all select 'EUR', 1)`;
  // Only the fixed table aliases are raw; the user ids are bound parameters.
  const visible = (alias: 's' | 'p') => {
    const table = sql.raw(alias);
    return sql`(${table}.user_id = ${userId} or (${table}.user_id = ${partnerId} and ${table}.is_joint))
      and ${table}.archived_at is null`;
  };
  const jointShare = (alias: 's' | 'p' | 'm') =>
    sql`(case when ${sql.raw(alias)}.is_joint then 0.5 else 1 end)`;
  const [row] = (await db.execute(sql`
    select
      (select coalesce(sum(s.balance * ${jointShare('s')} * r.rate), 0) from savings_accounts s
        join ${rates} r on r.currency = s.currency::text where ${visible('s')})::text as savings,
      (select coalesce(sum(greatest(0, coalesce(t.net, 0)) * h.current_price * r.rate), 0)
        from holdings h join ${rates} r on r.currency = h.currency::text
        left join (select holding_id, sum(case type when 'buy' then shares when 'sell' then -shares
          else 0 end) as net from holding_transactions group by holding_id) t on t.holding_id = h.id
        where h.user_id = ${userId} and h.archived_at is null)::text as brokerage,
      (select coalesce(sum((p.current_value * ${jointShare('p')} - case when p.mortgage_id is null
          then p.mortgage * ${jointShare('p')} else coalesce(m.outstanding_balance * ${jointShare('m')}, 0)
          end) * r.rate), 0)
        from properties p join ${rates} r on r.currency = p.currency::text
        left join mortgages m on m.id = p.mortgage_id and m.archived_at is null
        where ${visible('p')})::text as property_equity,
      (select coalesce(sum(pp.balance * r.rate), 0) from pension_pots pp
        join ${rates} r on r.currency = pp.currency::text
        where pp.user_id = ${userId} and pp.archived_at is null)::text as pension,
      (select coalesce(sum(d.remaining_balance * r.rate), 0) from debts d
        join ${rates} r on r.currency = d.currency::text
        where d.user_id = ${userId} and d.archived_at is null)::text as liabilities
  `)) as unknown as Array<Record<string, string>>;
  return {
    savings: Number(row!.savings),
    brokerage: Number(row!.brokerage),
    propertyEquity: Number(row!.property_equity),
    pension: Number(row!.pension),
    liabilities: Number(row!.liabilities),
  };
}

function cents(components: Components) {
  return Object.fromEntries(
    Object.entries({ ...components, netWorth: netWorth(components) }).map(([key, value]) => [
      key,
      toCents(value),
    ]),
  );
}

function fromApi(summary: DashboardAllocationsSummary): Components {
  const value = (key: string) => summary.allocations.find((row) => row.key === key)!.value;
  expect(summary.netWorth).toBeCloseTo(summary.totalAssets - summary.liabilitiesTotal, 6);
  expect(summary.portfolioTotal).toBe(value('brokerage'));
  return {
    savings: value('savings'),
    brokerage: value('brokerage'),
    propertyEquity: value('property_equity'),
    pension: value('pension'),
    liabilities: summary.liabilitiesTotal,
  };
}

async function expectReconciled(session: AuthSession, otherId: number, expected: Components) {
  const golden = cents(expected);
  const summary = await get<DashboardAllocationsSummary>(session, '/api/dashboard/allocations');
  expect(cents(fromApi(summary))).toEqual(golden);
  expect(cents(await pageTotals(session))).toEqual(golden);
  expect(cents(await databaseTotals(session.user.id, otherId))).toEqual(golden);

  // The dashboard's other views of the same moment agree to the cent.
  const dashboard = await get<{ allocations: DashboardAllocationsSummary }>(
    session,
    '/api/dashboard/summary',
  );
  expect(cents(fromApi(dashboard.allocations))).toEqual(golden);
  const history = await get<Array<{ totalValue: number }>>(session, '/api/dashboard/net-worth');
  expect(toCents(history.at(-1)!.totalValue)).toBe(golden.netWorth);

  // A stored snapshot rounds each component and the total separately: they agree within one
  // cent per component, and the total matches the live figure.
  await upsertCurrentNetWorthSnapshot(session.user.id);
  const [snapshot] = await db
    .select()
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.userId, session.user.id));
  expect(toCents(snapshot!.totalValue)).toBe(golden.netWorth);
  const recombined =
    toCents(snapshot!.savings) +
    toCents(snapshot!.brokerage) +
    toCents(snapshot!.propertyEquity) +
    toCents(snapshot!.pension) -
    toCents(snapshot!.liabilities);
  expect(Math.abs(recombined - golden.netWorth)).toBeLessThanOrEqual(5);
}

const plus = (base: Components, delta: Partial<Components>): Components => ({
  savings: base.savings + (delta.savings ?? 0),
  brokerage: base.brokerage + (delta.brokerage ?? 0),
  propertyEquity: base.propertyEquity + (delta.propertyEquity ?? 0),
  pension: base.pension + (delta.pension ?? 0),
  liabilities: base.liabilities + (delta.liabilities ?? 0),
});

describe('golden household totals reconcile across the API, the pages and the database', () => {
  let household: Household;

  beforeAll(async () => {
    household = await seedHousehold();
  });

  const expectBoth = async (owner: Components, partner: Components) => {
    await expectReconciled(household.owner, household.partner.user.id, owner);
    await expectReconciled(household.partner, household.owner.user.id, partner);
    // Each joint row is counted once across the two partners: the halves add up to the whole.
    const [home] = await get<Array<{ currentValue: number; mortgage: number }>>(
      household.owner,
      '/api/investments/properties',
    );
    expect(toCents(owner.propertyEquity + partner.propertyEquity)).toBe(
      toCents(home!.currentValue - home!.mortgage),
    );
  };

  test('baseline: private rows stay private and joint rows split 50/50', async () => {
    await expectBoth(OWNER_BASELINE, PARTNER_BASELINE);
    expect(netWorth(OWNER_BASELINE)).toBe(119_412);
    expect(netWorth(PARTNER_BASELINE)).toBe(86_460);
  });

  test('a partner repayment on the joint linked mortgage moves both equities by half', async () => {
    await create(household.partner, '/api/mortgages/transactions', {
      mortgageId: household.mortgageId,
      type: 'repayment',
      amount: 1_500,
      interest: 500,
      principal: 1_000,
      date: DATE,
    });
    await expectBoth(
      plus(OWNER_BASELINE, { propertyEquity: 500 }),
      plus(PARTNER_BASELINE, { propertyEquity: 500 }),
    );
  });

  test('a deposit, a move between accounts and its deletion conserve the totals', async () => {
    const afterRepayment = {
      owner: plus(OWNER_BASELINE, { propertyEquity: 500 }),
      partner: plus(PARTNER_BASELINE, { propertyEquity: 500 }),
    };
    // The owner pays into the partner's joint account: both savings rise by half.
    const deposit = await create(household.owner, '/api/savings/transactions', {
      accountId: household.partnerJointEur,
      type: 'deposit',
      amount: 1_000,
      date: DATE,
    });
    await expectBoth(
      plus(afterRepayment.owner, { savings: 500 }),
      plus(afterRepayment.partner, { savings: 500 }),
    );

    // Moving it to the owner's private account leaves the joint half and adds it in full.
    await read(
      await send(household.owner, 'PATCH', `/api/savings/transactions/${deposit.id}`, {
        accountId: household.ownerPrivateEur,
      }),
    );
    await expectBoth(plus(afterRepayment.owner, { savings: 1_000 }), afterRepayment.partner);

    // Deleting it restores the state before the deposit exactly.
    await read(await send(household.owner, 'DELETE', `/api/savings/transactions/${deposit.id}`));
    await expectBoth(afterRepayment.owner, afterRepayment.partner);
  });
});

test('a failed read fails the dashboard instead of leaving an asset class out', async () => {
  const household = await seedHousehold();
  const path = '/api/dashboard/net-worth';
  const before = await get<Array<{ totalValue: number }>>(household.owner, path);
  expect(toCents(before.at(-1)!.totalValue)).toBe(toCents(netWorth(OWNER_BASELINE)));

  // Make only the holdings read fail. Before the fix the request answered 200 with the
  // brokerage left out of an unflagged total.
  const select = db.select.bind(db);
  const spy = spyOn(db, 'select').mockImplementation(((...args: Parameters<typeof db.select>) => {
    const builder = select(...args);
    const from = builder.from.bind(builder);
    return Object.assign(builder, {
      from: (table: Parameters<typeof from>[0]) =>
        table === holdings
          ? { where: () => Promise.reject(new Error('synthetic read failure')) }
          : from(table),
    });
  }) as typeof db.select);
  try {
    const response = await send(household.owner, 'GET', path);
    expect(response.status).toBe(500);
  } finally {
    spy.mockRestore();
  }
  expect((await send(household.owner, 'GET', path)).status).toBe(200);
});
