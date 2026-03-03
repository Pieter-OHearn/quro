import type { Mortgage as MortgageType, MortgageTransaction } from '@quro/shared';
import type { AmortizationRow, OverpaymentImpact, PaymentBreakdownRow } from '../types';

const SCHEDULE_START_YEAR = 2026;
const SCHEDULE_END_YEAR = 2047;
const SCHEDULE_YEAR_STEP = 2;
const MONTHS_PER_YEAR = 12;
const PAYMENT_BREAKDOWN_LIMIT = 6;
const ISO_YEAR_MONTH_LENGTH = 7;

export function generateSchedule(
  balance: number,
  rate: number,
  monthlyPayment: number,
): AmortizationRow[] {
  const schedule: AmortizationRow[] = [];
  const monthlyRate = rate / 100 / 12;
  for (let year = SCHEDULE_START_YEAR; year <= SCHEDULE_END_YEAR; year += SCHEDULE_YEAR_STEP) {
    const interest = balance * monthlyRate * 12;
    const principal = monthlyPayment * 12 - interest;
    balance = Math.max(0, balance - principal);
    schedule.push({
      year: year.toString(),
      balance: Math.round(balance),
      principal: Math.round(principal),
      interest: Math.round(interest),
    });
    if (balance === 0) break;
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
  const monthlyRate = mortgage.interestRate / 100 / 12;
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
    amortization: generateSchedule(
      mortgage.outstandingBalance,
      mortgage.interestRate,
      mortgage.monthlyPayment,
    ),
    paymentBreakdown,
    overpaymentImpact,
  };
}
