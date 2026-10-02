export type { ConvertToBaseFn, IsForeignFn } from '@/lib/CurrencyContext';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';

export type SavingsFormatFn = (value: number, unit?: string, compact?: boolean) => string;
export type SavingsNativeFormatFn = (value: number, currency: string, compact?: boolean) => string;

export type SavingsChartDatum = {
  month: string;
  savings: number;
};

export type SavingsContributionDatum = {
  month: string;
  contribution: number;
  interest: number;
  withdrawals: number;
};

export type { SavingsTransactionType as TxnType } from '@quro/shared';
export type DeleteSavingsAccountMode = 'preserveTransactions' | 'deleteTransactions';

export type SaveAccountInput = Omit<SavingsAccount, 'id'> & { id?: number };
export type SaveTransactionInput = Omit<SavingsTransaction, 'id'> & { id?: number };

export type MonthBucket = {
  label: string;
  prefix: string;
  cutoff: string;
};
