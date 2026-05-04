import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';
import type { AmortizationRow, OverpaymentImpact, PaymentBreakdownRow } from '../types';

const SCHEDULE_YEAR_STEP = 2;
const MONTHS_PER_YEAR = 12;
const SCHEDULE_MONTH_STEP = SCHEDULE_YEAR_STEP * MONTHS_PER_YEAR;
const PAYMENT_BREAKDOWN_LIMIT = 6;
const ISO_YEAR_MONTH_LENGTH = 7;

type YearMonth = { year: number; monthIndex: number };

function parseYearMonth(value: string): YearMonth | null {
  const [yearPart, monthPart] = value.slice(0, ISO_YEAR_MONTH_LENGTH).split('-');
  const year = Number.parseInt(yearPart ?? '', 10);
  const month = Number.parseInt(monthPart ?? '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
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

function calculateContractRemainingMonths(mortgage: MortgageType, today: Date): number | null {
  const current = getCurrentYearMonth(today);
  const explicitEnd = parseYearMonth(mortgage.endDate);
  if (explicitEnd) return Math.max(0, monthsBetween(current, explicitEnd) + 1);

  const start = parseYearMonth(mortgage.startDate);
  if (!start || mortgage.termYears <= 0) return null;

  const elapsedMonths = Math.max(0, monthsBetween(start, current));
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
  let principalSinceLastPoint = 0;
  let interestSinceLastPoint = 0;

  schedule.push(buildScheduleRow(start, balance, 0, 0));

  for (let monthNumber = 1; monthNumber <= projectionMonths && balance > 0; monthNumber += 1) {
    const interest = Math.max(0, balance * monthlyRate);
    const principal = Math.min(balance, Math.max(0, mortgage.monthlyPayment - interest));
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

export function computeOverpaymentImpact(
  mortgage: MortgageType,
  monthlyRate: number,
  monthsRemainingRaw: number | null,
): OverpaymentImpact | null {
  if (monthsRemainingRaw == null) return null;
  const annualAllowance = (mortgage.outstandingBalance * mortgage.overpaymentLimit) / 100;
  if (!Number.isFinite(annualAllowance) || annualAllowance <= 0) return null;

  const extraMonthly = annualAllowance / MONTHS_PER_YEAR;
  const acceleratedPayment = mortgage.monthlyPayment + extraMonthly;
  const acceleratedMonthsRaw = calculateRemainingMonths(
    mortgage.outstandingBalance,
    monthlyRate,
    acceleratedPayment,
  );
  if (acceleratedMonthsRaw == null) return null;

  const baselineInterest =
    mortgage.monthlyPayment * monthsRemainingRaw - mortgage.outstandingBalance;
  const acceleratedInterest =
    acceleratedPayment * acceleratedMonthsRaw - mortgage.outstandingBalance;
  return {
    annualAllowance,
    extraMonthly,
    interestSaved: Math.max(0, baselineInterest - acceleratedInterest),
    monthsReduced: Math.max(0, Math.round(monthsRemainingRaw - acceleratedMonthsRaw)),
  };
}

export function formatTermReduction(monthsReduced: number): string {
  if (monthsReduced < MONTHS_PER_YEAR) {
    return `${monthsReduced} month${monthsReduced === 1 ? '' : 's'}`;
  }
  return `${(monthsReduced / MONTHS_PER_YEAR).toFixed(1)} years`;
}

export function computeMortgageMetrics(mortgage: MortgageType, txns: MortgageTransaction[]) {
  const monthlyRate = mortgage.interestRate / 100 / MONTHS_PER_YEAR;
  const monthsRemainingRaw = calculateRemainingMonths(
    mortgage.outstandingBalance,
    monthlyRate,
    mortgage.monthlyPayment,
  );
  const monthsRemaining = Math.round(monthsRemainingRaw ?? 0);
  const paid = mortgage.originalAmount - mortgage.outstandingBalance;
  const paymentBreakdown = computePaymentBreakdownRows(txns);
  const overpaymentImpact = computeOverpaymentImpact(mortgage, monthlyRate, monthsRemainingRaw);

  return {
    ltv: (mortgage.outstandingBalance / mortgage.propertyValue) * 100,
    equity: mortgage.propertyValue - mortgage.outstandingBalance,
    paid,
    paidPct: (paid / mortgage.originalAmount) * 100,
    monthsRemaining,
    yearsRemaining: Math.floor(monthsRemaining / 12),
    amortization: generateSchedule(mortgage, monthsRemainingRaw),
    paymentBreakdown,
    overpaymentImpact,
  };
}
