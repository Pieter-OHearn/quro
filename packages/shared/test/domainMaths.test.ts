/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import {
  computeHoldingPosition,
  formatPercent,
  holdingValue,
  householdAmount,
  householdShare,
  isInvestmentPropertyType,
  netHoldingShares,
  pensionTransactionDelta,
  previewHoldingTrade,
  signedSavingsAmount,
  sumMoney,
  toCents,
  type HoldingLedgerRow,
} from '../src/index.js';
import { GOLDEN_HOLDING_TRANSACTIONS, GOLDEN_POSITIONS } from './fixtures/goldenHousehold.js';

function seededRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return { next, int: (max: number) => Math.floor(next() * max) };
}

const trade = (
  id: number,
  type: string,
  shares: number | null,
  price: number,
  date = `2026-01-${String(id).padStart(2, '0')}`,
): HoldingLedgerRow => ({ id, type, shares, price, date });

describe('holding position', () => {
  test('golden positions of the shared fixture', () => {
    for (const [holdingId, expected] of Object.entries(GOLDEN_POSITIONS)) {
      const position = computeHoldingPosition(
        GOLDEN_HOLDING_TRANSACTIONS.filter((txn) => txn.holdingId === Number(holdingId)),
      );
      expect(position).toMatchObject(expected);
    }
  });

  test('an oversold holding sells what is held and nets the excess against later buys', () => {
    const position = computeHoldingPosition([
      trade(1, 'buy', 10, 10),
      trade(2, 'sell', 15, 12),
      trade(3, 'buy', 10, 11),
    ]);
    // The old page clamped each sell and showed 10 shares; the dashboard counted 5.
    expect(position).toEqual({
      shares: 5,
      costBasis: 55,
      avgCost: 11,
      realizedGain: 20,
      totalDividends: 0,
      lastTradePrice: 11,
    });
    expect(computeHoldingPosition([trade(1, 'buy', 10, 10), trade(2, 'sell', 15, 12)])).toEqual(
      expect.objectContaining({ shares: 0, costBasis: 0, avgCost: 0, realizedGain: 20 }),
    );
  });

  test('fractional shares are counted exactly', () => {
    const position = computeHoldingPosition([
      trade(1, 'buy', 0.1, 100),
      trade(2, 'buy', 0.2, 100),
      trade(3, 'sell', 0.3, 110),
    ]);
    // A float sum leaves 5.6e-17 shares, which marked the history as estimated.
    expect(0.1 + 0.2 - 0.3).toBeGreaterThan(0);
    expect(position.shares).toBe(0);
    expect(position.realizedGain).toBe(3);
    expect(netHoldingShares([trade(1, 'buy', 1.000001, 1), trade(2, 'sell', 0.000001, 1)])).toBe(1);
  });

  test('a zero-cost buy has no cost basis and no average cost', () => {
    const position = computeHoldingPosition([trade(1, 'buy', 7, 0)]);
    expect(position).toMatchObject({ shares: 7, costBasis: 0, avgCost: 0 });
    expect(holdingValue(position.shares, 4.5)).toBe(31.5);
  });

  test('dividends never move shares; unknown types and non-positive shares are ignored', () => {
    const position = computeHoldingPosition([
      trade(1, 'buy', 4, 25),
      trade(2, 'dividend', null, 3.335),
      trade(3, 'split', 4, 0),
      trade(4, 'buy', 0, 30),
      trade(5, 'sell', -2, 30),
    ]);
    expect(position).toMatchObject({ shares: 4, costBasis: 100, totalDividends: 3.34 });
  });

  test('trades replay in date order, then id, whatever the input order', () => {
    const rows = [trade(3, 'sell', 5, 30, '2026-02-01'), trade(2, 'buy', 10, 20, '2026-01-01')];
    const sameDay = [trade(9, 'sell', 5, 30, '2026-01-01'), trade(8, 'buy', 10, 20, '2026-01-01')];
    expect(computeHoldingPosition(rows)).toEqual(computeHoldingPosition([...rows].reverse()));
    expect(computeHoldingPosition(sameDay).realizedGain).toBe(50);
    expect(rows[0]!.id).toBe(3); // the input is not reordered in place
  });

  test('property: shares equal netHoldingShares, never negative, and cost stays whole cents', () => {
    const random = seededRandom(31);
    for (let index = 0; index < 500; index += 1) {
      const rows = Array.from({ length: 1 + random.int(12) }, (_, row) =>
        trade(
          row + 1,
          ['buy', 'buy', 'sell', 'dividend'][random.int(4)]!,
          random.int(2_000_000) / 1_000_000,
          random.int(50_000_000) / 1_000_000,
          `2026-0${1 + random.int(9)}-1${random.int(9)}`,
        ),
      );
      const position = computeHoldingPosition(rows);
      expect(position.shares).toBe(netHoldingShares(rows));
      expect(position.shares).toBeGreaterThanOrEqual(0);
      expect(position.costBasis).toBeGreaterThanOrEqual(0);
      for (const money of [position.costBasis, position.realizedGain, position.totalDividends]) {
        expect(Math.abs(money * 100 - toCents(money))).toBeLessThan(1e-6);
      }
      if (position.shares === 0) expect(position.costBasis).toBe(0);
    }
  });

  test('a preview applies the same rule as saving the trade', () => {
    const rows = [trade(1, 'buy', 10, 10), trade(2, 'buy', 5, 13)];
    const current = computeHoldingPosition(rows);
    for (const next of [trade(3, 'buy', 2.5, 12.345678), trade(3, 'sell', 6, 14)]) {
      expect(previewHoldingTrade(current, next)).toEqual(computeHoldingPosition([...rows, next]));
    }
  });

  test('a holding is worth shares × the unrounded price, rounded once', () => {
    expect(holdingValue(3.3333, 111.111111)).toBe(370.37); // 370.3703... not 3.3333 × 111.11
    expect(holdingValue(12, 50.123457)).toBe(601.48);
    expect(holdingValue(-5, 10)).toBe(0);
  });
});

describe('ledger signs', () => {
  test('pension: net contribution, negative fee, signed statement, unknown types do nothing', () => {
    expect(
      (
        [
          ['contribution', 500.1, 120.03],
          ['fee', 15, 0],
          ['annual_statement', -250, 0],
          ['transfer', 1_000, 0],
          ['contribution', 100, null],
        ] as const
      ).map(([type, amount, taxAmount]) => pensionTransactionDelta({ type, amount, taxAmount })),
    ).toEqual([380.07, -15, -250, 0, 100]);
  });

  test('savings: withdrawals subtract, deposits and interest add, unknown types do nothing', () => {
    expect(
      (
        [
          ['deposit', 100],
          ['interest', 2.5],
          ['withdrawal', 40],
          ['withdrawal', -40],
          ['deposit', -100],
          ['transfer', 7],
        ] as const
      ).map(([type, amount]) => signedSavingsAmount(type, amount)),
    ).toEqual([100, 2.5, -40, -40, 100, 0]);
  });
});

describe('investment property types', () => {
  test('compare trimmed and case-insensitively, including rental', () => {
    for (const type of [
      'Buy-to-Let',
      'buy-to-let',
      ' Buy-To-Let ',
      'rental',
      'Rental',
      'Commercial',
      'holiday home',
      'Investment',
    ]) {
      expect(isInvestmentPropertyType(type)).toBe(true);
    }
    for (const type of ['primary_home', 'Primary Residence', '', 'rentals', null, undefined]) {
      expect(isInvestmentPropertyType(type)).toBe(false);
    }
  });
});

describe('household share', () => {
  test('a joint row counts half for each partner, or in full for liquidity scenarios', () => {
    expect([householdShare(true), householdShare(true, 'full'), householdShare(false)]).toEqual([
      0.5, 1, 1,
    ]);
    expect(householdShare(undefined)).toBe(1);
  });

  test('the two partners’ parts of a joint amount add up to the whole before rounding', () => {
    const random = seededRandom(32);
    for (let index = 0; index < 500; index += 1) {
      const amount = random.int(10_000_000_000) / 100;
      expect(householdAmount(amount, true) * 2).toBe(amount);
      expect(householdAmount(amount, true, 'full')).toBe(amount);
    }
  });
});

describe('money totals', () => {
  test('sums are exact in cents and independent of order', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([])).toBe(0);
    expect(sumMoney([3_000.005, 2_360.0177])).toBe(5_360.03);
    const random = seededRandom(33);
    for (let index = 0; index < 200; index += 1) {
      const amounts = Array.from(
        { length: 50 },
        () => (random.int(2_000_000_00) - 1_000_000_00) / 100,
      );
      expect(sumMoney(amounts)).toBe(sumMoney([...amounts].reverse()));
      expect(toCents(sumMoney(amounts))).toBe(amounts.reduce((sum, a) => sum + toCents(a), 0));
    }
  });
});

describe('formatPercent', () => {
  test('uses the user’s number format with grouping', () => {
    expect(formatPercent(1.84, 'en-US', 2)).toBe('1.84%');
    expect(formatPercent(1.84, 'de-DE', 2)).toBe('1,84%');
    expect(formatPercent(1234.5, 'en-US')).toBe('1,234.5%');
    expect(formatPercent(1234.5, 'de-DE')).toBe('1.234,5%');
    expect(formatPercent(-12.345, 'de-DE', 2)).toBe('-12,35%');
  });

  test('renders non-finite and near-zero values as zero, never -0', () => {
    expect(formatPercent(Number.NaN, 'en-US')).toBe('0.0%');
    expect(formatPercent(Number.POSITIVE_INFINITY, 'de-DE', 0)).toBe('0%');
    expect(formatPercent(-0.001, 'en-US')).toBe('0.0%');
    expect(formatPercent(-0.04, 'de-DE')).toBe('0,0%');
  });

  test('falls back to the default format for an unknown preference', () => {
    expect(formatPercent(1234.5, 'fr-FR')).toBe('1,234.5%');
    expect(formatPercent(1234.5, null)).toBe('1,234.5%');
  });
});
