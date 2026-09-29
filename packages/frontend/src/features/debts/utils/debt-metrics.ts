import { monthlyInterest, monthsToPayoff, roundMoney, type Debt } from '@quro/shared';

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

export function calculateDebtPayoffDate(
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

  return Math.max(
    0,
    Number.parseFloat((months * debt.monthlyPayment - debt.remainingBalance).toFixed(2)),
  );
}

export function buildDebtOverview(
  debts: readonly Debt[],
  convertToBase: (amount: number, currency: string) => number,
): DebtOverview {
  const totals = debts.reduce(
    (acc, debt) => {
      const balance = convertToBase(debt.remainingBalance, debt.currency);
      acc.totalBalance += balance;
      acc.totalMonthlyPayment += convertToBase(debt.monthlyPayment, debt.currency);
      acc.highestInterestRate = Math.max(acc.highestInterestRate, debt.interestRate);
      acc.weightedInterestTotal += debt.interestRate * balance;
      return acc;
    },
    {
      totalBalance: 0,
      totalMonthlyPayment: 0,
      highestInterestRate: 0,
      weightedInterestTotal: 0,
    },
  );

  return {
    debtCount: debts.length,
    totalBalance: totals.totalBalance,
    totalMonthlyPayment: totals.totalMonthlyPayment,
    averageInterestRate:
      totals.totalBalance > 0 ? totals.weightedInterestTotal / totals.totalBalance : 0,
    highestInterestRate: totals.highestInterestRate,
  };
}
