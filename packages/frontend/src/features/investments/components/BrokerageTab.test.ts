/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { roundMoney, type Holding } from '@quro/shared';
import { computeHoldingRowMetrics } from './BrokerageTab';
import type { Position } from '../utils/position';

const holding: Holding = {
  id: 1,
  name: 'Fictional Retail Group',
  ticker: 'FRGP',
  currentPrice: 18.75,
  currency: 'GBP',
  sector: 'Consumer',
  priceUpdatedAt: '2026-10-12T08:00:00.000Z',
};
const position: Position = {
  shares: 150,
  avgCost: 29.9667,
  costBasis: 4_495,
  totalDividends: 0,
  realizedGain: 0,
};
// One rate for today: 1 GBP = 1.18 EUR. No purchase-date rate exists.
const convertToBase = (amount: number, currency: string) =>
  currency === 'GBP' ? roundMoney(amount * 1.18) : amount;
const isForeign = (currency: string) => currency !== 'EUR';

test('a holding row shows its gain in the base currency, the cost converted at today’s rate', () => {
  const metrics = computeHoldingRowMetrics(holding, [], position, convertToBase, isForeign);

  expect(metrics.nativeValue).toBe(2_812.5);
  expect(metrics.valueInBase).toBe(3_318.75);
  // 3,318.75 EUR value less 4,495.00 GBP cost × 1.18 = 5,304.10 EUR.
  expect(metrics.gainBase).toBe(-1_985.35);
  expect(metrics.foreign).toBe(true);
});

test('a holding in the base currency gains its native gain', () => {
  const metrics = computeHoldingRowMetrics(
    { ...holding, currency: 'EUR', currentPrice: 40 },
    [],
    position,
    convertToBase,
    isForeign,
  );

  expect(metrics.gainBase).toBe(1_505);
  expect(metrics.foreign).toBe(false);
});
