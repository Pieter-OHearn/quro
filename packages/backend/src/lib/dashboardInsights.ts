import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { DashboardInsights } from '@quro/shared';
import { db } from '../db/client';
import { holdingTransactions, payslips } from '../db/schema';

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
  const buyMonth = sql<string>`to_char(${holdingTransactions.date}, 'YYYY-MM')`;
  const [salaryMonths, buyMonths] = await Promise.all([
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
    db
      .selectDistinct({ month: buyMonth })
      .from(holdingTransactions)
      .where(
        and(
          eq(holdingTransactions.userId, userId),
          eq(holdingTransactions.type, 'buy'),
          gte(holdingTransactions.date, `${year}-01-01`),
          lt(holdingTransactions.date, `${year + 1}-01-01`),
        ),
      )
      .orderBy(buyMonth),
  ]);
  return {
    latestPayslip: latestPayslip ?? null,
    salaryMonths: salaryMonths.map(({ month: monthKey, ...row }) => ({
      ...row,
      date: `${monthKey}-01`,
    })),
    investHabitBuyMonths: buyMonths.map((row) => row.month),
  };
}
