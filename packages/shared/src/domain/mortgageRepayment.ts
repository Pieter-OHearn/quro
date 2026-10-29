import { fromCents, roundMoney, toCents } from '../utils/money.js';

const MONTHS_PER_YEAR = 12;

/** The loan terms a monthly repayment follows. `interestRate` is an annual percentage. */
export type MortgageRepaymentTerms = {
  repaymentType: 'Annuity' | 'Linear';
  originalAmount: number;
  termYears: number;
  monthlyPayment: number;
  interestRate: number;
};

/** A recorded rate change: the new annual percentage rate (`amount`) from `date` on. */
export type MortgageRateChange = { date: string; amount: number };

export type ExpectedMortgageRepayment = { amount: number; interest: number; principal: number };

/**
 * The annual rate in effect on `date` (`YYYY-MM-DD`): the latest rate change dated on or before it,
 * otherwise the mortgage's current rate (the rate before the first change is not recorded).
 */
export function mortgageRateOnDate(
  currentRate: number,
  rateChanges: readonly MortgageRateChange[],
  date: string,
): number {
  let latest: MortgageRateChange | null = null;
  for (const change of rateChanges) {
    if (change.date > date) continue;
    if (latest === null || change.date >= latest.date) latest = change;
  }
  return latest?.amount ?? currentRate;
}

// The principal the loan type schedules for a month, before the balance caps it.
function scheduledPrincipalCents(terms: MortgageRepaymentTerms, interestCents: number): number {
  if (terms.repaymentType === 'Annuity') return toCents(terms.monthlyPayment) - interestCents;
  const contractMonths = terms.termYears * MONTHS_PER_YEAR;
  return contractMonths > 0 ? toCents(terms.originalAmount / contractMonths) : 0;
}

/**
 * The expected monthly repayment on a balance at an annual rate: interest is the balance × rate / 12;
 * principal is the original amount / (term × 12) for a linear loan and the monthly payment less the
 * interest for an annuity, never below zero and capped at the balance; the amount is their sum.
 * Every figure is rounded to cents.
 */
export function expectedMortgageRepayment(
  terms: MortgageRepaymentTerms,
  balance: number,
  annualRate: number,
): ExpectedMortgageRepayment {
  const balanceCents = Math.max(0, toCents(balance));
  const interestCents = Math.max(
    0,
    toCents((fromCents(balanceCents) * annualRate) / 100 / MONTHS_PER_YEAR),
  );
  const principalCents = Math.min(
    balanceCents,
    Math.max(0, scheduledPrincipalCents(terms, interestCents)),
  );
  return {
    amount: fromCents(principalCents + interestCents),
    interest: fromCents(interestCents),
    principal: fromCents(principalCents),
  };
}

/**
 * The expected repayment on `date` for a mortgage whose balance before the payment is `balance`,
 * at the rate in effect on that date. Part months and overpayments are not guessed.
 */
export function suggestMortgageRepayment(
  terms: MortgageRepaymentTerms,
  balance: number,
  date: string,
  rateChanges: readonly MortgageRateChange[] = [],
): ExpectedMortgageRepayment & { rate: number } {
  const rate = mortgageRateOnDate(terms.interestRate, rateChanges, date);
  return { ...expectedMortgageRepayment(terms, roundMoney(balance), rate), rate };
}
