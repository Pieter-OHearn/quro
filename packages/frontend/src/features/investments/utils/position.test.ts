/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { HoldingTransaction, Property } from '@quro/shared';
import { computePositions, getPropertyOwnershipShare } from './position';

const property = (isJoint: boolean): Property => ({ isJoint }) as Property;

test('uses a half share for joint properties', () => {
  expect(getPropertyOwnershipShare(property(true))).toBe(0.5);
});

test('uses the full share for individually owned properties', () => {
  expect(getPropertyOwnershipShare(property(false))).toBe(1);
});

const txn = (
  id: number,
  holdingId: number,
  type: HoldingTransaction['type'],
  date: string,
  shares: number | null,
  price: number,
): HoldingTransaction => ({ id, holdingId, type, date, shares, price, note: '' });

test('groups positions without mixing holdings, mutating input, or reordering same-day trades', () => {
  const transactions = [
    txn(1, 1, 'sell', '2026-02-01', 5, 30),
    txn(2, 2, 'buy', '2026-01-01', 3, 50),
    txn(3, 1, 'buy', '2026-01-01', 10, 10),
    txn(4, 1, 'buy', '2026-01-01', 10, 20),
    txn(5, 1, 'dividend', '2026-02-02', null, 12),
    txn(6, 2, 'sell', '2026-01-01', 3, 60),
  ];
  const before = structuredClone(transactions);
  expect(computePositions([{ id: 1 }, { id: 2 }, { id: 3 }], transactions)).toEqual({
    1: { shares: 15, avgCost: 15, realizedGain: 75, totalDividends: 12 },
    2: { shares: 0, avgCost: 0, realizedGain: 30, totalDividends: 0 },
    3: { shares: 0, avgCost: 0, realizedGain: 0, totalDividends: 0 },
  });
  expect(transactions).toEqual(before);
});
