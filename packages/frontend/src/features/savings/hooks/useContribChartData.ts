import { useMemo } from 'react';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import type { ConvertToBaseFn } from '../types';
import { buildContribChartData } from '../utils/savings-data';

export function useContribChartData(
  transactions: SavingsTransaction[],
  accounts: SavingsAccount[],
  convertToBase: ConvertToBaseFn,
) {
  return useMemo(
    () => buildContribChartData(transactions, accounts, convertToBase),
    [transactions, accounts, convertToBase],
  );
}
