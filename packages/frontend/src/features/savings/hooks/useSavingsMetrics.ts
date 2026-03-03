import { useMemo } from 'react';
import type { SavingsAccount } from '@quro/shared';
import type { ConvertToBaseFn } from '../types';
import { computeSavingsMetrics } from '../utils/savings-data';

export function useSavingsMetrics(accounts: SavingsAccount[], convertToBase: ConvertToBaseFn) {
  return useMemo(() => computeSavingsMetrics(accounts, convertToBase), [accounts, convertToBase]);
}
