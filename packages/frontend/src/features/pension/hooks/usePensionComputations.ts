import { useMemo } from 'react';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import type { ConvertToBaseFn, PensionGrowthPoint } from '../types';
import {
  computeMonthlyDrawdown,
  computePensionGrowthData,
  computePensionGrowthPercent,
  computePensionTotals,
  computeProjectedPensionValue,
} from '../utils/pension-calculations';

export type PensionComputations = {
  totalInBase: number;
  totalMonthlyContribInBase: number;
  projected: number | null;
  monthlyDrawdown: number | null;
  yearsToRetirement: number | null;
  pensionGrowthData: PensionGrowthPoint[];
  pensionGrowthPct: number | null;
};

export function usePensionComputations(
  pensions: PensionPot[],
  pensionTxns: PensionTransaction[],
  convertToBase: ConvertToBaseFn,
  yearsToRetirement: number | null,
): PensionComputations {
  const { totalInBase, totalMonthlyContribInBase } = useMemo(
    () => computePensionTotals(pensions, convertToBase),
    [pensions, convertToBase],
  );

  const projected = useMemo(
    () => computeProjectedPensionValue(totalInBase, totalMonthlyContribInBase, yearsToRetirement),
    [totalInBase, totalMonthlyContribInBase, yearsToRetirement],
  );

  const pensionGrowthData = useMemo(
    () => computePensionGrowthData(pensions, pensionTxns, convertToBase),
    [pensions, pensionTxns, convertToBase],
  );

  const pensionGrowthPct = useMemo(
    () => computePensionGrowthPercent(pensionGrowthData),
    [pensionGrowthData],
  );

  return {
    totalInBase,
    totalMonthlyContribInBase,
    projected,
    monthlyDrawdown: computeMonthlyDrawdown(projected),
    yearsToRetirement,
    pensionGrowthData,
    pensionGrowthPct,
  };
}
