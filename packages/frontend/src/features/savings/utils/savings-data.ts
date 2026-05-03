import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import { MONTH_PREFIXES } from '../constants';
import type { ConvertToBaseFn, SavingsChartDatum, SavingsContributionDatum } from '../types';

export function computeSavingsMetrics(
  accounts: SavingsAccount[],
  convertToBase: ConvertToBaseFn,
): {
  totalInBase: number;
  totalInterest: number;
  avgRate: number;
} {
  const totalInBase = accounts.reduce((sum, account) => {
    return sum + convertToBase(account.balance, account.currency);
  }, 0);

  const totalInterest = accounts.reduce((sum, account) => {
    return (
      sum + convertToBase((account.balance * account.interestRate) / 100 / 12, account.currency)
    );
  }, 0);

  const avgRate =
    accounts.length > 0 && totalInBase > 0
      ? accounts.reduce((sum, account) => {
          const weight = convertToBase(account.balance, account.currency) / totalInBase;
          return sum + account.interestRate * weight;
        }, 0)
      : 0;

  return {
    totalInBase,
    totalInterest,
    avgRate,
  };
}

export function buildContribChartData(
  transactions: SavingsTransaction[],
  accounts: SavingsAccount[],
  convertToBase: ConvertToBaseFn,
): SavingsContributionDatum[] {
  function toBase(transaction: SavingsTransaction): number {
    const account = accounts.find((item) => item.id === transaction.accountId);
    return convertToBase(transaction.amount, account?.currency ?? 'EUR');
  }

  return MONTH_PREFIXES.map(({ label, prefix }) => {
    const monthTransactions = transactions.filter((transaction) =>
      transaction.date.startsWith(prefix),
    );
    const deposits = monthTransactions
      .filter((transaction) => transaction.type === 'deposit')
      .reduce((sum, transaction) => sum + toBase(transaction), 0);
    const withdrawals = monthTransactions
      .filter((transaction) => transaction.type === 'withdrawal')
      .reduce((sum, transaction) => sum + toBase(transaction), 0);
    const interest = monthTransactions
      .filter((transaction) => transaction.type === 'interest')
      .reduce((sum, transaction) => sum + toBase(transaction), 0);

    return {
      month: label,
      contribution: Math.round(deposits - withdrawals),
      interest: Math.round(interest),
      withdrawals: Math.round(withdrawals),
    };
  });
}

export function buildGrowthChartData(
  transactions: SavingsTransaction[],
  accounts: SavingsAccount[],
  convertToBase: ConvertToBaseFn,
): SavingsChartDatum[] {
  function isArchivedAtCutoff(account: SavingsAccount, cutoff: string): boolean {
    return Boolean(account.archivedAt && account.archivedAt.slice(0, 10) <= cutoff);
  }

  return MONTH_PREFIXES.map(({ label, prefix }) => {
    const cutoff = `${prefix}-31`;

    const savingsAtCutoff = accounts.reduce((sum, account) => {
      if (isArchivedAtCutoff(account, cutoff)) return sum;

      const futureEffect = transactions
        .filter((transaction) => transaction.accountId === account.id && transaction.date > cutoff)
        .reduce((transactionSum, transaction) => {
          const amountInBase = convertToBase(transaction.amount, account.currency);
          return transaction.type === 'withdrawal'
            ? transactionSum - amountInBase
            : transactionSum + amountInBase;
        }, 0);

      return sum + convertToBase(account.balance, account.currency) - futureEffect;
    }, 0);

    return {
      month: label,
      savings: Math.max(0, Math.round(savingsAtCutoff)),
    };
  });
}
