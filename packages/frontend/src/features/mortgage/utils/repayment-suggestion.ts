import {
  suggestMortgageRepayment,
  type Mortgage as MortgageType,
  type MortgageTransaction,
} from '@quro/shared';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `date` (`YYYY-MM-DD`) one calendar month later, on the month's last day when it is shorter. */
export function addOneMonth(date: string): string {
  const match = ISO_DATE.exec(date);
  if (!match) return date;
  const [, yearPart, monthPart, dayPart] = match;
  const year = Number(yearPart);
  const monthIndex = Number(monthPart); // the next month, zero-based
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, monthIndex, Math.min(Number(dayPart), lastDay)));
  return next.toISOString().slice(0, 10);
}

/** The next repayment's date: a month after the latest recorded one, otherwise today. */
export function nextRepaymentDate(transactions: readonly MortgageTransaction[], today: string) {
  const latest = transactions
    .filter((transaction) => transaction.type === 'repayment')
    .reduce<string | null>(
      (max, transaction) => (max === null || transaction.date > max ? transaction.date : max),
      null,
    );
  return latest === null ? today : addOneMonth(latest);
}

/** "November repayment" for a repayment dated in November. */
export function repaymentNote(date: string): string {
  if (!ISO_DATE.test(date)) return 'Monthly repayment';
  const month = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${month} repayment`;
}

export type RepaymentSuggestion = {
  amount: number;
  interest: number;
  principal: number;
  rate: number;
};

/**
 * The repayment the loan expects on `date`: interest on the balance before it at the rate in
 * effect then, and the principal the loan type schedules. The current balance stands in for the
 * balance before the payment; part months and overpayments are not guessed.
 */
export function suggestRepayment(
  mortgage: MortgageType,
  transactions: readonly MortgageTransaction[],
  date: string,
): RepaymentSuggestion {
  const rateChanges = transactions
    .filter((transaction) => transaction.type === 'rate_change')
    .map((transaction) => ({ date: transaction.date, amount: transaction.amount }));
  return suggestMortgageRepayment(mortgage, mortgage.outstandingBalance, date, rateChanges);
}
