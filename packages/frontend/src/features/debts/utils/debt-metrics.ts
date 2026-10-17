import { monthlyInterest, monthsToPayoff, roundMoney, sumMoney, type Debt } from '@quro/shared';

export type DebtOverview = {
  debtCount: number;
  totalBalance: number;
  totalMonthlyPayment: number;
  averageInterestRate: number;
  highestInterestRate: number;
};

export function calculateDebtPaidAmount(debt: Pick<Debt, 'originalAmount' | 'remainingBalance'>) {
  return Math.max(0, debt.originalAmount - debt.remainingBalance);
}

export function calculateDebtPaidPercentage(
  debt: Pick<Debt, 'originalAmount' | 'remainingBalance'>,
) {
  if (debt.originalAmount <= 0) return 0;
  return Math.min((calculateDebtPaidAmount(debt) / debt.originalAmount) * 100, 100);
}

export function estimateDebtMonthlyInterest(debt: Pick<Debt, 'remainingBalance' | 'interestRate'>) {
  if (debt.remainingBalance <= 0 || debt.interestRate <= 0) return 0;
  return roundMoney(monthlyInterest(debt.remainingBalance, debt.interestRate));
}

export function calculateDebtMonthsRemaining(
  balance: number,
  annualInterestRate: number,
  monthlyPayment: number,
): number | null {
  if (balance <= 0) return 0;
  const months = monthsToPayoff(balance, annualInterestRate / 100 / 12, monthlyPayment);
  return months === null ? null : Math.ceil(months);
}

function calculateDebtPayoffDate(
  debt: Pick<Debt, 'remainingBalance' | 'interestRate' | 'monthlyPayment'>,
  today = new Date(),
): Date | null {
  const months = calculateDebtMonthsRemaining(
    debt.remainingBalance,
    debt.interestRate,
    debt.monthlyPayment,
  );
  if (months == null) return null;

  const payoffDate = new Date(today);
  payoffDate.setMonth(payoffDate.getMonth() + months);
  return payoffDate;
}

export function formatDebtPayoffLabel(
  debt: Pick<Debt, 'remainingBalance' | 'interestRate' | 'monthlyPayment'>,
  today = new Date(),
) {
  const payoffDate = calculateDebtPayoffDate(debt, today);
  if (!payoffDate) return 'n/a';

  return payoffDate.toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  });
}

export function estimateDebtRemainingInterest(
  debt: Pick<Debt, 'remainingBalance' | 'interestRate' | 'monthlyPayment'>,
) {
  const months = calculateDebtMonthsRemaining(
    debt.remainingBalance,
    debt.interestRate,
    debt.monthlyPayment,
  );
  if (months == null) return null;

  return Math.max(0, roundMoney(months * debt.monthlyPayment - debt.remainingBalance));
}

export function buildDebtOverview(
  debts: readonly Debt[],
  convertToBase: (amount: number, currency: string) => number,
): DebtOverview {
  const balances = debts.map((debt) => convertToBase(debt.remainingBalance, debt.currency));
  const unroundedBalance = balances.reduce((sum, balance) => sum + balance, 0);
  const weightedInterestTotal = debts.reduce(
    (sum, debt, index) => sum + debt.interestRate * balances[index],
    0,
  );

  return {
    debtCount: debts.length,
    // Money totals are sums of cents, like the dashboard's liabilities.
    totalBalance: sumMoney(balances),
    totalMonthlyPayment: sumMoney(
      debts.map((debt) => convertToBase(debt.monthlyPayment, debt.currency)),
    ),
    averageInterestRate: unroundedBalance > 0 ? weightedInterestTotal / unroundedBalance : 0,
    highestInterestRate: debts.reduce((highest, debt) => Math.max(highest, debt.interestRate), 0),
  };
}
