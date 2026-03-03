import type { SavingsAccount, SavingsTransaction } from '@quro/shared';

export type SavingsFormatFn = (value: number, unit?: unknown, compact?: boolean) => string;
export type SavingsNativeFormatFn = (value: number, currency: string, compact?: boolean) => string;

export type ConvertToBaseFn = (value: number, currency: string) => number;
export type IsForeignFn = (currency: string) => boolean;

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

export type TxnType = 'deposit' | 'withdrawal' | 'interest';

export type SaveAccountInput = Omit<SavingsAccount, 'id'> & { id?: number };
export type SaveTransactionInput = Omit<SavingsTransaction, 'id'>;
