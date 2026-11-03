import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { DashboardInsights } from '@quro/shared';
import { db } from '../db/client';
import { goals, holdings, holdingTransactions, payslips } from '../db/schema';
import { getSalaryWindowStart } from '../lib/dashboardInsights';
import { createIntegrationHelpers } from '../test/integration';

const integration = createIntegrationHelpers('wp9.integration.quro.test');
beforeAll(() => integration.cleanup());
afterAll(() => integration.cleanup());

function payslip(
  userId: number,
  date: string,
  currency: 'EUR' | 'GBP',
  gross: number,
  net: number,
  bonus: number | null,
) {
  return { userId, date, currency, gross, net, bonus, month: date.slice(0, 7), tax: 0, pension: 0 };
}

test('insights aggregate only the owner, keep currencies and a salary window anchored to the latest payslip', async () => {
  const owner = await integration.signUp('owner');
  const outsider = await integration.signUp('outsider');
  await db
    .insert(payslips)
    .values([
      payslip(owner.user.id, '2024-03-01', 'EUR', 3000, 1000, 100),
      payslip(owner.user.id, '2024-03-31', 'EUR', 4000, 2000, null),
      payslip(owner.user.id, '2024-03-31', 'GBP', 2500, 500, 50),
      payslip(owner.user.id, '2024-06-01', 'EUR', 4500, 3300, null),
      payslip(owner.user.id, '2025-03-28', 'GBP', 6000, 4000, 500),
      payslip(owner.user.id, '2024-02-29', 'EUR', 90000, 90000, 0),
      payslip(outsider.user.id, '2030-01-01', 'EUR', 99999, 99999, 0),
    ]);
  const [holding] = await db
    .insert(holdings)
    .values({
      userId: owner.user.id,
      name: 'Archived',
      ticker: 'TEST',
      currentPrice: 10,
      currency: 'EUR',
      sector: 'Test',
      archivedAt: new Date(),
    })
    .returning();
  await db.insert(holdingTransactions).values([
    {
      userId: owner.user.id,
      holdingId: holding.id,
      type: 'buy',
      date: '2025-01-01',
      shares: 1,
      price: 10,
    },
    {
      userId: owner.user.id,
      holdingId: holding.id,
      type: 'buy',
      date: '2025-01-31',
      shares: 1,
      price: 10,
    },
    {
      userId: owner.user.id,
      holdingId: holding.id,
      type: 'buy',
      date: '2025-12-31',
      shares: 1,
      price: 10,
    },
    {
      userId: owner.user.id,
      holdingId: holding.id,
      type: 'buy',
      date: '2024-12-31',
      shares: 1,
      price: 10,
    },
    {
      userId: owner.user.id,
      holdingId: holding.id,
      type: 'buy',
      date: '2026-01-01',
      shares: 1,
      price: 10,
    },
    {
      userId: owner.user.id,
      holdingId: holding.id,
      type: 'sell',
      date: '2025-06-01',
      shares: 1,
      price: 10,
    },
    {
      userId: outsider.user.id,
      holdingId: holding.id,
      type: 'buy',
      date: '2025-02-01',
      shares: 1,
      price: 10,
    },
  ]);
  const insights = async () => {
    const response = await integration.request('/api/dashboard/insights?year=2025', {
      cookie: owner.cookie,
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { data: DashboardInsights }).data;
  };
  // Without an invest habit there are no months to count buys for.
  expect((await insights()).investHabitBuys).toEqual([]);

  const [usdHolding] = await db
    .insert(holdings)
    .values({
      userId: owner.user.id,
      name: 'Dollar fund',
      ticker: 'USDF',
      currentPrice: 30,
      currency: 'USD',
      sector: 'Test',
    })
    .returning();
  await db.insert(holdingTransactions).values([
    // 1.5 × 33.333 = 49.9995 and 0.5 × 0.01 = 0.005: each buy rounds to cents once.
    {
      userId: owner.user.id,
      holdingId: usdHolding.id,
      type: 'buy',
      date: '2025-01-15',
      shares: 1.5,
      price: 33.333,
    },
    {
      userId: owner.user.id,
      holdingId: usdHolding.id,
      type: 'buy',
      date: '2025-01-20',
      shares: 0.5,
      price: 0.01,
    },
  ]);
  const habit = {
    userId: owner.user.id,
    type: 'invest_habit',
    sourceType: 'invest_habit_buys',
    name: 'Habit',
    currentAmount: 0,
    targetAmount: 0,
    category: 'Investing',
    monthlyContribution: 0,
    monthlyTarget: 20,
    currency: 'EUR' as const,
  };
  await db.insert(goals).values([
    { ...habit, startMonth: 'Dec 2025', deadline: 'Jan 2026', year: 2026, totalMonths: 2 },
    { ...habit, startMonth: 'Jan 2025', deadline: 'Feb 2025', year: 2025, totalMonths: 2 },
    // Saved before start months existed: its first month of its year.
    { ...habit, startMonth: null, deadline: 'Dec 2023', year: 2023, totalMonths: 1 },
  ]);
  await db.insert(goals).values({
    ...habit,
    userId: outsider.user.id,
    startMonth: 'Jan 2024',
    deadline: 'Dec 2024',
    year: 2024,
  });

  const data = await insights();
  expect(data).toEqual({
    latestPayslip: { date: '2025-03-28', gross: 6000, currency: 'GBP' },
    salaryMonths: [
      { date: '2024-03-01', net: 3000, bonus: 100, currency: 'EUR' },
      { date: '2024-03-01', net: 500, bonus: 50, currency: 'GBP' },
      { date: '2024-06-01', net: 3300, bonus: 0, currency: 'EUR' },
      { date: '2025-03-01', net: 4000, bonus: 500, currency: 'GBP' },
    ],
    // The habits cover Jan 2023, Jan and Feb 2025, Dec 2025 and Jan 2026: the Dec 2024 buy, the
    // sell, and the outsider's buy and habit are not counted.
    investHabitBuys: [
      { month: '2025-01', currency: 'EUR', amount: 20 },
      { month: '2025-01', currency: 'USD', amount: 50.01 },
      { month: '2025-12', currency: 'EUR', amount: 10 },
      { month: '2026-01', currency: 'EUR', amount: 10 },
    ],
  });
});

test('validates insight years, requires authentication, and handles users with no financial records', async () => {
  expect((await integration.request('/api/dashboard/insights?year=2025')).status).toBe(401);
  const owner = await integration.signUp('empty');
  for (const year of ['', 'NaN', '2025.5', '999', '9999']) {
    expect(
      (await integration.request(`/api/dashboard/insights?year=${year}`, { cookie: owner.cookie }))
        .status,
    ).toBe(400);
  }
  const response = await integration.request('/api/dashboard/insights?year=2025', {
    cookie: owner.cookie,
  });
  expect(await response.json()).toEqual({
    data: { latestPayslip: null, salaryMonths: [], investHabitBuys: [] },
  });
  expect(getSalaryWindowStart('2025-01-31')).toBe('2024-01-01');
});
