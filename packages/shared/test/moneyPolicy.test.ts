/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { fromCents, roundMoney, toCents } from '../src/utils/index';

// Property tests for the arithmetic policy in docs/financial-invariants.md: amounts are stored as
// PostgreSQL numeric, carried as JavaScript numbers, and rounded to cents half away from zero
// (as PostgreSQL rounds numeric) at the documented points. Cases come from a seeded generator so
// a failure can be replayed.

const CASES = 20_000;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A decimal string with `fractionDigits` digits and an integer part below `maxInteger`. */
function decimalString(random: () => number, maxInteger: number, fractionDigits: number): string {
  const sign = random() < 0.5 ? '-' : '';
  const integer = Math.floor(random() * maxInteger);
  const fraction = String(Math.floor(random() * 10 ** fractionDigits)).padStart(
    fractionDigits,
    '0',
  );
  return `${sign}${integer}.${fraction}`;
}

/** Exact cents of a decimal string, rounded half away from zero, without floating point. */
function exactCents(decimal: string): bigint {
  const negative = decimal.startsWith('-');
  const [integer, fraction = ''] = (negative ? decimal.slice(1) : decimal).split('.');
  const padded = fraction.padEnd(3, '0');
  let cents = BigInt(integer!) * 100n + BigInt(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1n;
  return negative ? -cents : cents;
}

describe('cent rounding', () => {
  test('toCents rounds half away from zero, exactly like numeric, for amounts below 10^12', () => {
    const random = seededRandom(1);
    for (let index = 0; index < CASES; index += 1) {
      const decimal = decimalString(random, 1e12, 3);
      expect({ decimal, cents: BigInt(toCents(Number(decimal))) }).toEqual({
        decimal,
        cents: exactCents(decimal),
      });
    }
  });

  test('half-cent ties round away from zero in both directions', () => {
    const random = seededRandom(2);
    for (let index = 0; index < CASES; index += 1) {
      const decimal = `${decimalString(random, 1e9, 2)}5`;
      expect(BigInt(toCents(Number(decimal)))).toBe(exactCents(decimal));
    }
    expect([toCents(1.005), toCents(-1.005), toCents(2.675), toCents(-0.125)]).toEqual([
      101, -101, 268, -13,
    ]);
  });

  test('roundMoney is idempotent, symmetric in sign and never returns negative zero', () => {
    const random = seededRandom(3);
    for (let index = 0; index < CASES; index += 1) {
      const value = Number(decimalString(random, 1e9, 4));
      const rounded = roundMoney(value);
      expect(roundMoney(rounded)).toBe(rounded);
      expect(roundMoney(-value)).toBe(rounded === 0 ? 0 : -rounded);
      expect(Object.is(rounded, -0)).toBe(false);
    }
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(fromCents(toCents(19.99))).toBe(19.99);
  });
});

describe('cent amounts carried as numbers', () => {
  test('two-decimal amounts below 10^13 survive the text-number-text round trip', () => {
    const random = seededRandom(4);
    for (let index = 0; index < CASES; index += 1) {
      const decimal = decimalString(random, 1e13, 2);
      expect(Number(decimal).toFixed(2)).toBe(decimal === '-0.00' ? '0.00' : decimal);
    }
    // Why the bound matters: past ~10^14 a double no longer holds every cent.
    expect(Number('92492225766181.76').toFixed(2)).toBe('92492225766181.77');
  });

  test('cents are additive: rounding a sum of cent amounts equals adding their cents', () => {
    const random = seededRandom(5);
    for (let index = 0; index < CASES; index += 1) {
      const left = Number(decimalString(random, 1e12, 2));
      const right = Number(decimalString(random, 1e12, 2));
      expect(toCents(left + right)).toBe(toCents(left) + toCents(right));
    }
  });

  test('a long float sum of cent amounts rounds to the exact cent total', () => {
    // Rounding error grows with the number of terms and the size of the running sum; this is
    // inside the documented envelope (2,000 terms below 10^6 each).
    const random = seededRandom(6);
    for (let round = 0; round < 50; round += 1) {
      const amounts = Array.from({ length: 2_000 }, () => decimalString(random, 1e6, 2));
      const floatSum = amounts.reduce((sum, amount) => sum + Number(amount), 0);
      const exact = amounts.reduce((sum, amount) => sum + exactCents(amount), 0n);
      expect(BigInt(toCents(floatSum))).toBe(exact);
    }
  });
});
