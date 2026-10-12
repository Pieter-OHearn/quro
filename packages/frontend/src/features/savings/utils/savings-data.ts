import {
  householdAmount,
  monthlyInterest,
  signedSavingsAmount,
  sumMoney,
  type SavingsAccount,
  type SavingsTransaction,
} from '@quro/shared';
import type {
  ConvertToBaseFn,
  MonthBucket,
  SavingsChartDatum,
  SavingsContributionDatum,
} from '../types';

function buildRollingMonthBuckets(monthCount = 7): MonthBucket[] {
  const now = new Date();

  return Array.from({ length: monthCount }, (_, index) => {
    const monthStartDate = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const year = monthStartDate.getFullYear();
    const month = monthStartDate.getMonth() + 1;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthEndDate = new Date(year, month, 0);
    const cutoff = `${prefix}-${String(monthEndDate.getDate()).padStart(2, '0')}`;

    return {
      label: monthStartDate.toLocaleString('en-GB', { month: 'short' }),
      prefix,
      cutoff,
    };
  }).reverse();
}

/** The person's share of an account's balance, in the display currency. */
export function attributedSavingsBalanceInBase(
  account: Pick<SavingsAccount, 'balance' | 'currency' | 'isJoint'>,
  convertToBase: ConvertToBaseFn,
): number {
  return convertToBase(householdAmount(account.balance, account.isJoint), account.currency);
}

export function computeSavingsMetrics(
  accounts: SavingsAccount[],
  convertToBase: ConvertToBaseFn,
): {
  totalInBase: number;
  totalInterest: number;
  avgRate: number;
} {
  // The page total is the person's savings, like the dashboard: a joint account counts at the
  // household share. Account rows still show each account's full balance.
  const totalInBase = sumMoney(
    accounts.map((account) => attributedSavingsBalanceInBase(account, convertToBase)),
  );

  const totalInterest = sumMoney(
    accounts.map((account) =>
      convertToBase(
        monthlyInterest(householdAmount(account.balance, account.isJoint), account.interestRate),
        account.currency,
      ),
    ),
  );

  // Rates are weighted by the unrounded attributed balances: a rate is not money.
  const attributed = accounts.map((account) =>
    attributedSavingsBalanceInBase(account, convertToBase),
  );
  const attributedTotal = attributed.reduce((sum, balance) => sum + balance, 0);
  const avgRate =
    accounts.length > 0 && attributedTotal > 0
      ? accounts.reduce(
          (sum, account, index) =>
            sum + account.interestRate * (attributed[index] / attributedTotal),
          0,
        )
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
  // Flows on a joint account count at the household share, like the page total.
  function toBase(transaction: SavingsTransaction): number {
    const account = accounts.find((item) => item.id === transaction.accountId);
    return convertToBase(
      householdAmount(transaction.amount, account?.isJoint),
      account?.currency ?? 'EUR',
    );
  }

  return buildRollingMonthBuckets().map(({ label, prefix }) => {
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

  return buildRollingMonthBuckets().map(({ label, cutoff }) => {
    const savingsAtCutoff = accounts.reduce((sum, account) => {
      if (isArchivedAtCutoff(account, cutoff)) return sum;

      const futureEffect = transactions
        .filter((transaction) => transaction.accountId === account.id && transaction.date > cutoff)
        .reduce(
          (transactionSum, transaction) =>
            transactionSum +
            convertToBase(
              householdAmount(
                signedSavingsAmount(transaction.type, transaction.amount),
                account.isJoint,
              ),
              account.currency,
            ),
          0,
        );

      return sum + attributedSavingsBalanceInBase(account, convertToBase) - futureEffect;
    }, 0);

    return {
      month: label,
      savings: Math.max(0, Math.round(savingsAtCutoff)),
    };
  });
}
