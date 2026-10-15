import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
  addMonthsUtc,
  CURRENCY_CODES,
  monthEndUtc,
  monthStartUtc,
  NET_WORTH_RANGES,
  toIsoDate,
  type NetWorthRange,
  type NetWorthSnapshot,
} from '@quro/shared';
import { db } from '../db/client';
import {
  currencyRateHistory,
  holdingPriceHistory,
  holdingTransactions,
  holdings,
  netWorthSnapshots,
  savingsAccounts,
  savingsTransactions,
} from '../db/schema';
import { NET_WORTH_ALL_MAX_MONTHS } from '../lib/netWorthHistory';
import { createIntegrationHelpers, insertPartnerLink, type AuthSession } from '../test/integration';
import { useFixtureCurrencyRates } from '../test/currencyRates';

const integration = createIntegrationHelpers('net-worth-ranges.quro.test');
const RATE_PROVIDER = 'net-worth-ranges-test';
// Every non-EUR currency gets one stored rate on this day, so FX is known from then on.
const FIRST_RATE_DATE = '2001-02-03';
const DAY_MS = 86_400_000;

beforeAll(async () => {
  await integration.cleanup();
  await useFixtureCurrencyRates(RATE_PROVIDER);
  await db
    .insert(currencyRateHistory)
    .values(
      CURRENCY_CODES.filter((code) => code !== 'EUR').map((fromCurrency) => ({
        fromCurrency,
        toCurrency: 'EUR' as const,
        rate: 1.1,
        provider: RATE_PROVIDER,
        sourceDate: FIRST_RATE_DATE,
      })),
    )
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(currencyRateHistory).where(eq(currencyRateHistory.provider, RATE_PROVIDER));
  await integration.cleanup();
});

type Point = NetWorthSnapshot;

const daysAgo = (days: number) => toIsoDate(new Date(Date.now() - days * DAY_MS));
const monthEndAgo = (months: number) =>
  toIsoDate(new Date(monthEndUtc(addMonthsUtc(monthStartUtc(Date.now()), -months))));
const monthEndOf = (isoDate: string) =>
  toIsoDate(new Date(monthEndUtc(monthStartUtc(Date.parse(`${isoDate}T00:00:00Z`)))));
const withoutId = (points: readonly Point[]) => points.map(({ id: _id, ...rest }) => rest);

async function history(session: AuthSession, range?: string): Promise<Point[]> {
  const query = range === undefined ? '' : `?range=${encodeURIComponent(range)}`;
  const response = await integration.request(`/api/dashboard/net-worth${query}`, {
    cookie: session.cookie,
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: Point[] }).data;
}

async function addAccount(
  userId: number,
  balance: number,
  transactions: ReadonlyArray<{ amount: number; date: string }>,
  isJoint = false,
) {
  const [account] = await db
    .insert(savingsAccounts)
    .values({
      userId,
      name: isJoint ? 'Joint savings' : 'Savings',
      bank: 'Test bank',
      accountType: 'Easy Access',
      balance,
      currency: 'EUR',
      interestRate: 0,
      isJoint,
    })
    .returning();
  if (transactions.length > 0) {
    await db.insert(savingsTransactions).values(
      transactions.map((transaction) => ({
        userId,
        accountId: account!.id,
        type: 'deposit',
        amount: transaction.amount,
        date: transaction.date,
      })),
    );
  }
  return account!;
}

const valueOn = (points: readonly Point[], date: string) =>
  points.find((point) => point.date === date)?.totalValue;

describe('net worth history ranges', () => {
  test('refuses a range outside the list with 400', async () => {
    const owner = await integration.signUp('invalid');
    for (const range of ['', '2y', 'ALL', '6M', '1w', 'all ']) {
      const response = await integration.request(
        `/api/dashboard/net-worth?range=${encodeURIComponent(range)}`,
        { cookie: owner.cookie },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid range' });
    }
  });

  test('the default is the six-month series the summary returns', async () => {
    const owner = await integration.signUp('default');
    await addAccount(owner.user.id, 1000, [{ amount: 200, date: daysAgo(40) }]);
    const byDefault = await history(owner);
    expect(await history(owner, '6m')).toEqual(byDefault);
    const summary = await integration.request('/api/dashboard/summary', { cookie: owner.cookie });
    expect(((await summary.json()) as { data: { netWorth: Point[] } }).data.netWorth).toEqual(
      byDefault,
    );
    expect(byDefault).toHaveLength(7);
    expect(byDefault[0]!.date).toBe(monthEndAgo(6));
    expect(byDefault.at(-1)!.date).toBe(daysAgo(0));
    expect(byDefault.map((point) => point.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('each range covers its window and agrees with the others on shared points', async () => {
    const owner = await integration.signUp('windows');
    const first = daysAgo(1000);
    await addAccount(owner.user.id, 2000, [
      { amount: 100, date: first },
      { amount: 200, date: daysAgo(400) },
      { amount: 300, date: daysAgo(100) },
      { amount: 400, date: daysAgo(10) },
    ]);
    const [oneMonth, sixMonths, oneYear, all] = await Promise.all(
      (['1m', '6m', '1y', 'all'] as const).map((range) => history(owner, range)),
    );

    // 1m: one point per day, from 30 days ago to today.
    expect(oneMonth.map((point) => point.date)).toEqual(
      Array.from({ length: 31 }, (_, index) => daysAgo(30 - index)),
    );
    expect(valueOn(oneMonth, daysAgo(11))).toBe(1600);
    expect(valueOn(oneMonth, daysAgo(10))).toBe(2000);
    expect(valueOn(oneMonth, daysAgo(30))).toBe(1600);

    // 6m and 1y: month ends from 6 or 12 months back, then today.
    expect(sixMonths).toHaveLength(7);
    expect(oneYear).toHaveLength(13);
    expect(oneYear[0]!.date).toBe(monthEndAgo(12));
    expect(withoutId(oneYear.slice(-7))).toEqual(withoutId(sixMonths));

    // all: month ends from the month of the first record.
    expect(all[0]!.date).toBe(monthEndOf(first));
    expect(all[0]!.totalValue).toBe(2000 - 200 - 300 - 400);
    expect(withoutId(all.slice(-13))).toEqual(withoutId(oneYear));

    // Every range ends at the same moment with the same figure.
    for (const points of [oneMonth, sixMonths, oneYear]) {
      expect(withoutId([points.at(-1)!])).toEqual(withoutId([all.at(-1)!]));
    }
    expect(all.at(-1)!.totalValue).toBe(2000);
  });

  test(`all starts at most ${NET_WORTH_ALL_MAX_MONTHS} months back`, async () => {
    const owner = await integration.signUp('cap');
    await addAccount(owner.user.id, 500, [{ amount: 50, date: '1950-01-01' }]);
    const all = await history(owner, 'all');
    expect(all).toHaveLength(NET_WORTH_ALL_MAX_MONTHS + 1);
    expect(all[0]!.date).toBe(monthEndAgo(NET_WORTH_ALL_MAX_MONTHS));
  });

  test('an empty household answers one current point in every range', async () => {
    const owner = await integration.signUp('empty');
    const today = new Date();
    for (const range of NET_WORTH_RANGES) {
      expect(await history(owner, range)).toEqual([
        {
          id: 1,
          month: today.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
          year: today.getUTCFullYear(),
          date: daysAgo(0),
          totalValue: 0,
          currency: 'EUR',
          isEstimated: false,
        },
      ]);
    }
  });

  test("joint rows count at the household share; a partner's private rows stay out", async () => {
    const owner = await integration.signUp('owner');
    const partner = await integration.signUp('partner');
    await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
    const jointStart = daysAgo(200);
    await addAccount(
      partner.user.id,
      1000,
      [
        { amount: 600, date: jointStart },
        { amount: 400, date: daysAgo(5) },
      ],
      true,
    );
    await addAccount(partner.user.id, 7000, [
      { amount: 3000, date: daysAgo(3) },
      { amount: 1, date: '2000-05-05' },
    ]);

    const ownerOneMonth = await history(owner, '1m');
    expect(valueOn(ownerOneMonth, daysAgo(6))).toBe(300);
    expect(valueOn(ownerOneMonth, daysAgo(5))).toBe(500);
    expect(ownerOneMonth.at(-1)!.totalValue).toBe(500);

    // The partner's private row from 2000 does not move the owner's start.
    const ownerAll = await history(owner, 'all');
    expect(ownerAll[0]!.date).toBe(monthEndOf(jointStart));
    expect(ownerAll[0]!.totalValue).toBe(300);
    expect(new Set(ownerAll.map((point) => point.totalValue))).toEqual(new Set([300, 500]));

    const partnerOneMonth = await history(partner, '1m');
    expect(valueOn(partnerOneMonth, daysAgo(4))).toBe(4000 + 500);
    expect(partnerOneMonth.at(-1)!.totalValue).toBe(7000 + 500);
    expect((await history(partner, 'all'))[0]!.date).toBe('2000-05-31');
  });

  test('points are estimated before the first stored rate and while a holding has no price', async () => {
    const owner = await integration.signUp('estimated');
    await addAccount(owner.user.id, 1000, [{ amount: 100, date: '2000-06-15' }]);
    const all = await history(owner, 'all');
    const estimatedOn = (points: readonly Point[], date: string) =>
      points.find((point) => point.date === date)?.isEstimated;
    expect(all[0]!.date).toBe('2000-06-30');
    expect(estimatedOn(all, '2001-01-31')).toBe(true);
    expect(estimatedOn(all, '2001-02-28')).toBe(false);
    expect(all.at(-1)!.isEstimated).toBe(false);

    const [holding] = await db
      .insert(holdings)
      .values({
        userId: owner.user.id,
        name: 'Index fund',
        ticker: 'TEST',
        sector: 'Test',
        currentPrice: 12,
        currency: 'EUR',
      })
      .returning();
    await db.insert(holdingTransactions).values({
      userId: owner.user.id,
      holdingId: holding!.id,
      type: 'buy',
      shares: 10,
      price: 10,
      date: daysAgo(90),
    });
    await db.insert(holdingPriceHistory).values({
      userId: owner.user.id,
      holdingId: holding!.id,
      eodDate: daysAgo(20),
      closePrice: 12,
      priceCurrency: 'EUR',
    });
    const oneMonth = await history(owner, '1m');
    expect(estimatedOn(oneMonth, daysAgo(21))).toBe(true);
    expect(valueOn(oneMonth, daysAgo(21))).toBe(1000 + 100);
    expect(estimatedOn(oneMonth, daysAgo(20))).toBe(false);
    expect(valueOn(oneMonth, daysAgo(20))).toBe(1000 + 120);
  });

  test('1m rebuilds every day while the monthly ranges keep completed snapshots', async () => {
    const owner = await integration.signUp('snapshots');
    await addAccount(owner.user.id, 1000, []);
    await db.insert(netWorthSnapshots).values({
      userId: owner.user.id,
      snapshotDate: monthEndAgo(1),
      baseCurrency: 'EUR',
      savings: 12345,
      brokerage: 0,
      propertyEquity: 0,
      pension: 0,
      liabilities: 0,
      totalValue: 12345,
      isEstimated: false,
    });
    const ranges: NetWorthRange[] = ['6m', '1y', 'all'];
    for (const range of ranges) {
      const points = await history(owner, range);
      expect(valueOn(points, monthEndAgo(1))).toBe(12345);
      expect(points.at(-1)!.totalValue).toBe(1000);
    }
    const oneMonth = await history(owner, '1m');
    expect(oneMonth.every((point) => point.totalValue === 1000)).toBe(true);
  });
});
