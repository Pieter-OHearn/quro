import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  goalMonthKey,
  investHabitMonths,
  nextGoalMonth,
  sumInvestHabitBuys,
  type DashboardInsights,
  type GoalMonth,
  type InvestHabitBuyTotal,
} from '@quro/shared';
import { db } from '../db/client';
import { goals, holdings, holdingTransactions, payslips } from '../db/schema';

const SALARY_WINDOW_MONTHS = 12;

export function getSalaryWindowStart(latestDate: string): string {
  const latest = new Date(`${latestDate}T00:00:00Z`);
  return new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() - SALARY_WINDOW_MONTHS, 1))
    .toISOString()
    .slice(0, 10);
}

export async function loadDashboardInsights(
  userId: number,
  year: number,
): Promise<DashboardInsights> {
  const [latestPayslip] = await db
    .select({
      date: payslips.date,
      gross: payslips.gross,
      currency: payslips.currency,
    })
    .from(payslips)
    .where(eq(payslips.userId, userId))
    .orderBy(desc(payslips.date), asc(payslips.id))
    .limit(1);

  const month = sql<string>`to_char(${payslips.date}, 'YYYY-MM')`;
  const [salaryMonths, investHabitBuys] = await Promise.all([
    latestPayslip
      ? db
          .select({
            month,
            currency: payslips.currency,
            net: sql`sum(${payslips.net})`.mapWith(Number),
            bonus: sql`sum(coalesce(${payslips.bonus}, 0))`.mapWith(Number),
          })
          .from(payslips)
          .where(
            and(
              eq(payslips.userId, userId),
              gte(payslips.date, getSalaryWindowStart(latestPayslip.date)),
            ),
          )
          .groupBy(month, payslips.currency)
          .orderBy(month, payslips.currency)
      : [],
    loadInvestHabitBuys(userId, year),
  ]);
  return {
    latestPayslip: latestPayslip ?? null,
    salaryMonths: salaryMonths.map(({ month: monthKey, ...row }) => ({
      ...row,
      date: `${monthKey}-01`,
    })),
    investHabitBuys,
  };
}

function firstDayOfMonth(month: GoalMonth): string {
  return `${goalMonthKey(month)}-01`;
}

/**
 * The buys an invest habit counts: per month and currency, over the months of the user's invest
 * habits, so a habit that spans years sees every month it covers.
 */
async function loadInvestHabitBuys(userId: number, year: number): Promise<InvestHabitBuyTotal[]> {
  const habits = await db
    .select({
      startMonth: goals.startMonth,
      deadline: goals.deadline,
      year: goals.year,
      totalMonths: goals.totalMonths,
    })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.type, 'invest_habit')));
  const months = habits.flatMap((habit) => investHabitMonths(habit, year));
  if (months.length === 0) return [];

  const keys = new Set(months.map(goalMonthKey));
  const ordered = [...months].sort((a, b) => a.year - b.year || a.month - b.month);
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const afterLast = nextGoalMonth(last);
  const buys = await db
    .select({
      date: holdingTransactions.date,
      shares: holdingTransactions.shares,
      price: holdingTransactions.price,
      currency: holdings.currency,
    })
    .from(holdingTransactions)
    .innerJoin(holdings, eq(holdings.id, holdingTransactions.holdingId))
    .where(
      and(
        eq(holdingTransactions.userId, userId),
        eq(holdingTransactions.type, 'buy'),
        gte(holdingTransactions.date, firstDayOfMonth(first)),
        lt(holdingTransactions.date, firstDayOfMonth(afterLast)),
      ),
    );
  return sumInvestHabitBuys(buys).filter((total) => keys.has(total.month));
}
