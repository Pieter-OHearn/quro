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
  totalInBase: number,
  convertToBase: ConvertToBaseFn,
): SavingsChartDatum[] {
  return MONTH_PREFIXES.map(({ label, prefix }) => {
    const cutoff = `${prefix}-31`;
    const futureTransactions = transactions.filter((transaction) => transaction.date > cutoff);

    const futureEffect = futureTransactions.reduce((sum, transaction) => {
      const account = accounts.find((item) => item.id === transaction.accountId);
      const amountInBase = convertToBase(transaction.amount, account?.currency ?? 'EUR');

      return transaction.type === 'withdrawal' ? sum - amountInBase : sum + amountInBase;
    }, 0);

    return {
      month: label,
      savings: Math.max(0, Math.round(totalInBase - futureEffect)),
    };
  });
}
