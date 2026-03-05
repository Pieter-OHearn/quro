import type { Holding } from '@quro/shared';

export type IncomeTxnLabels = {
  singular: 'Dividend' | 'Distribution';
  plural: 'Dividends' | 'Distributions';
  lowerSingular: 'dividend' | 'distribution';
};

export function isFundLikeHolding(holding: Holding): boolean {
  if (holding.itemType === 'etf' || holding.itemType === 'fund') {
    return true;
  }
  return /\b(etf|fund)\b/i.test(holding.sector);
}

export function getIncomeTxnLabels(holding: Holding): IncomeTxnLabels {
  if (isFundLikeHolding(holding)) {
    return {
      singular: 'Distribution',
      plural: 'Distributions',
      lowerSingular: 'distribution',
    };
  }
  return {
    singular: 'Dividend',
    plural: 'Dividends',
    lowerSingular: 'dividend',
  };
}
