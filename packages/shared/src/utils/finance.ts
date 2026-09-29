const MONTHS_PER_YEAR = 12;
const PERCENT = 100;

/** Interest accrued in one month on `balance` at an annual percentage rate. */
export function monthlyInterest(balance: number, annualPct: number): number {
  return (balance * annualPct) / PERCENT / MONTHS_PER_YEAR;
}

/**
 * Months needed to pay off `balance` with a fixed `monthlyPayment` at a
 * `monthlyRate` (fraction, e.g. 0.004). Returns null when it can never be paid off.
 */
export function monthsToPayoff(
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
  return Number.isFinite(months) && months > 0 ? months : null;
}
