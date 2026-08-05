import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';
import type { AmortizationRow, PaymentBreakdownRow } from '../types';

const SCHEDULE_YEAR_STEP = 2;
const MONTHS_PER_YEAR = 12;
const SCHEDULE_MONTH_STEP = SCHEDULE_YEAR_STEP * MONTHS_PER_YEAR;
const PAYMENT_BREAKDOWN_LIMIT = 6;
const ISO_YEAR_MONTH_LENGTH = 7;

type YearMonth = { year: number; monthIndex: number };
type CalendarDate = YearMonth & { day: number };

function parseCalendarDate(value: string): CalendarDate | null {
  const isoMatch = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(value.trim());
  if (isoMatch) {
    const [, yearPart, monthPart, dayPart] = isoMatch;
    const year = Number.parseInt(yearPart ?? '', 10);
    const month = Number.parseInt(monthPart ?? '', 10);
    const day = Number.parseInt(dayPart ?? '1', 10);
    const candidate = new Date(year, month - 1, day);
    if (
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day
    ) {
      return { year, monthIndex: month - 1, day };
    }
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return {
    year: parsed.getFullYear(),
    monthIndex: parsed.getMonth(),
    day: parsed.getDate(),
  };
}

function getCurrentYearMonth(today: Date): YearMonth {
  return { year: today.getFullYear(), monthIndex: today.getMonth() };
}

function monthsBetween(start: YearMonth, end: YearMonth): number {
  return (end.year - start.year) * MONTHS_PER_YEAR + end.monthIndex - start.monthIndex;
}

function addMonths(start: YearMonth, monthOffset: number): YearMonth {
  const total = start.year * MONTHS_PER_YEAR + start.monthIndex + monthOffset;
  return {
    year: Math.floor(total / MONTHS_PER_YEAR),
    monthIndex: ((total % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR,
  };
}

export function calculateContractRemainingMonths(
  mortgage: MortgageType,
  today = new Date(),
): number | null {
  const current: CalendarDate = { ...getCurrentYearMonth(today), day: today.getDate() };
  const explicitEnd = parseCalendarDate(mortgage.endDate);
  if (explicitEnd) {
    const partialMonth = explicitEnd.day > current.day ? 1 : 0;
    return Math.max(0, monthsBetween(current, explicitEnd) + partialMonth);
  }

  const start = parseCalendarDate(mortgage.startDate);
  if (!start || mortgage.termYears <= 0) return null;

  const partialMonth = current.day < start.day ? 1 : 0;
  const elapsedMonths = Math.max(0, monthsBetween(start, current) - partialMonth);
  return Math.max(0, mortgage.termYears * MONTHS_PER_YEAR - elapsedMonths);
}

function calculateProjectionMonths(
  mortgage: MortgageType,
  monthsRemainingRaw: number | null,
  today: Date,
): number {
  if (monthsRemainingRaw != null && Number.isFinite(monthsRemainingRaw)) {
    return Math.max(0, Math.ceil(monthsRemainingRaw));
  }

  const contractMonths = calculateContractRemainingMonths(mortgage, today);
  if (contractMonths != null) return contractMonths;

  return Math.max(0, mortgage.termYears * MONTHS_PER_YEAR);
}

function buildScheduleRow(
  date: YearMonth,
  balance: number,
  principal: number,
  interest: number,
): AmortizationRow {
  return {
    year: String(date.year),
    balance: Math.round(balance),
    principal: Math.round(principal),
    interest: Math.round(interest),
  };
}

function calculateLinearMonthlyPrincipal(mortgage: MortgageType): number | null {
  const contractMonths = mortgage.termYears * MONTHS_PER_YEAR;
  if (!(mortgage.originalAmount > 0 && contractMonths > 0)) return null;
  const principal = mortgage.originalAmount / contractMonths;
  return Number.isFinite(principal) && principal > 0 ? principal : null;
}

function calculateProjectedRemainingMonths(
  mortgage: MortgageType,
  monthlyRate: number,
): number | null {
  if (mortgage.repaymentType === 'Linear') {
    const monthlyPrincipal = calculateLinearMonthlyPrincipal(mortgage);
    if (monthlyPrincipal == null || mortgage.outstandingBalance <= 0) return null;
    return mortgage.outstandingBalance / monthlyPrincipal;
  }

  return calculateRemainingMonths(
    mortgage.outstandingBalance,
    monthlyRate,
    mortgage.monthlyPayment,
  );
}

export function generateSchedule(
  mortgage: MortgageType,
  monthsRemainingRaw: number | null,
  today = new Date(),
): AmortizationRow[] {
  let balance = mortgage.outstandingBalance;
  const schedule: AmortizationRow[] = [];
  const start = getCurrentYearMonth(today);
  const monthlyRate = mortgage.interestRate / 100 / MONTHS_PER_YEAR;
  const projectionMonths = calculateProjectionMonths(mortgage, monthsRemainingRaw, today);
  const linearMonthlyPrincipal = calculateLinearMonthlyPrincipal(mortgage);
  let principalSinceLastPoint = 0;
  let interestSinceLastPoint = 0;

  schedule.push(buildScheduleRow(start, balance, 0, 0));

  for (let monthNumber = 1; monthNumber <= projectionMonths && balance > 0; monthNumber += 1) {
    const interest = Math.max(0, balance * monthlyRate);
    const principal = Math.min(
      balance,
      mortgage.repaymentType === 'Linear'
        ? (linearMonthlyPrincipal ?? 0)
        : Math.max(0, mortgage.monthlyPayment - interest),
    );
    balance = Math.max(0, balance - principal);
    principalSinceLastPoint += principal;
    interestSinceLastPoint += interest;

    const shouldSample =
      monthNumber % SCHEDULE_MONTH_STEP === 0 || monthNumber === projectionMonths || balance === 0;
    if (!shouldSample) continue;

    schedule.push({
      ...buildScheduleRow(
        addMonths(start, monthNumber),
        balance,
        principalSinceLastPoint,
        interestSinceLastPoint,
      ),
    });
    principalSinceLastPoint = 0;
    interestSinceLastPoint = 0;
  }

  return schedule;
}

export function calculateRemainingMonths(
  balance: number,
  monthlyRate: number,
  monthlyPayment: number,
): number | null {
  const inputs = [balance, monthlyRate, monthlyPayment];
  if (inputs.some((value) => !Number.isFinite(value))) return null;
  if (balance <= 0 || monthlyPayment <= 0) return null;
  if (monthlyRate <= 0) return balance / monthlyPayment;

  const ratio = 1 - (balance * monthlyRate) / monthlyPayment;
  if (!(ratio > 0 && ratio < 1)) return null;

  const months = -Math.log(ratio) / Math.log(1 + monthlyRate);
  if (!(Number.isFinite(months) && months > 0)) return null;
  return months;
}

export function computePaymentBreakdownRows(txns: MortgageTransaction[]): PaymentBreakdownRow[] {
  const byMonth = new Map<string, { principal: number; interest: number; timestamp: number }>();

  for (const txn of txns) {
    if (txn.type !== 'repayment') continue;
    const monthKey = txn.date.slice(0, ISO_YEAR_MONTH_LENGTH);
    const monthTimestamp = Date.parse(`${monthKey}-01T00:00:00Z`);
    if (!Number.isFinite(monthTimestamp)) continue;

    const interest = txn.interest ?? 0;
    const principal = txn.principal ?? Math.max(0, txn.amount - interest);
    const month = byMonth.get(monthKey) ?? { principal: 0, interest: 0, timestamp: monthTimestamp };
    month.principal += principal;
    month.interest += interest;
    byMonth.set(monthKey, month);
  }

  return [...byMonth.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-PAYMENT_BREAKDOWN_LIMIT)
    .map((month) => ({
      month: new Date(month.timestamp).toLocaleDateString('en-GB', { month: 'short' }),
      principal: Math.round(month.principal),
      interest: Math.round(month.interest),
    }));
}

export function computeMortgageMetrics(
  mortgage: MortgageType,
  txns: MortgageTransaction[],
  today = new Date(),
) {
  const monthlyRate = mortgage.interestRate / 100 / MONTHS_PER_YEAR;
  const monthsRemainingRaw = calculateProjectedRemainingMonths(mortgage, monthlyRate);
  const contractMonthsRemaining = calculateContractRemainingMonths(mortgage, today);
  const monthsRemaining = contractMonthsRemaining ?? Math.round(monthsRemainingRaw ?? 0);
  const paid = mortgage.originalAmount - mortgage.outstandingBalance;
  const paymentBreakdown = computePaymentBreakdownRows(txns);

  return {
    ltv: (mortgage.outstandingBalance / mortgage.propertyValue) * 100,
    equity: mortgage.propertyValue - mortgage.outstandingBalance,
    paid,
    paidPct: (paid / mortgage.originalAmount) * 100,
    monthsRemaining,
    yearsRemaining: Math.floor(monthsRemaining / 12),
    amortization: generateSchedule(mortgage, monthsRemainingRaw, today),
    paymentBreakdown,
  };
}
