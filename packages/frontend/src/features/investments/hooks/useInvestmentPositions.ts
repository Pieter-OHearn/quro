import { useMemo } from 'react';
import type { Holding, HoldingTransaction } from '@quro/shared';
import { computePositions, type Position } from '../utils/position';

export function useInvestmentPositions(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
): Record<number, Position> {
  return useMemo<Record<number, Position>>(
    () => computePositions(holdings, holdingTxns),
    [holdings, holdingTxns],
  );
}
