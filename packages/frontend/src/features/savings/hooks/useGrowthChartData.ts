import { useMemo } from 'react';
import type { SavingsAccount, SavingsTransaction } from '@quro/shared';
import type { ConvertToBaseFn } from '../types';
import { buildGrowthChartData } from '../utils/savings-data';

export function useGrowthChartData(
  transactions: SavingsTransaction[],
  accounts: SavingsAccount[],
  totalInBase: number,
  convertToBase: ConvertToBaseFn,
) {
  return useMemo(
    () => buildGrowthChartData(transactions, accounts, totalInBase, convertToBase),
    [transactions, accounts, totalInBase, convertToBase],
  );
}
