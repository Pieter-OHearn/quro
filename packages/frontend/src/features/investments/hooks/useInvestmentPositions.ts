import { useMemo } from 'react';
import type { Holding, HoldingTransaction } from '@quro/shared';
import { computePosition, type Position } from '../utils/position';

export function useInvestmentPositions(
  holdings: Holding[],
  holdingTxns: HoldingTransaction[],
): Record<number, Position> {
  return useMemo<Record<number, Position>>(
    () =>
      Object.fromEntries(
        holdings.map((holding) => [holding.id, computePosition(holding.id, holdingTxns)]),
      ),
    [holdings, holdingTxns],
  );
}
