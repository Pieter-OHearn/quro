/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import {
  addMonthsUtc,
  formatPercent,
  monthEndUtc,
  monthlyInterest,
  monthsToPayoff,
  monthStartUtc,
  roundMoney,
  toCents,
  toIsoDate,
  toUtcTimestamp,
} from '../src/utils/index';

test('money helpers work in cents', () => {
  expect(toCents(19.99)).toBe(1999);
  expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
});

test('date helpers operate in UTC', () => {
  expect(toIsoDate(new Date('2026-03-05T23:59:00Z'))).toBe('2026-03-05');
  const start = monthStartUtc(toUtcTimestamp('2026-03-15'));
  expect(toIsoDate(new Date(start))).toBe('2026-03-01');
  expect(toIsoDate(new Date(monthEndUtc(start)))).toBe('2026-03-31');
  expect(toIsoDate(new Date(addMonthsUtc(start, -3)))).toBe('2025-12-01');
});

test('finance helpers', () => {
  expect(monthlyInterest(12000, 6)).toBe(60);
  expect(monthsToPayoff(1200, 0, 100)).toBe(12);
  expect(monthsToPayoff(1000, 0.01, 5)).toBeNull();
  expect(formatPercent(12.345, 2)).toBe('12.35%');
  expect(formatPercent(Number.NaN)).toBe('0.0%');
  expect(formatPercent(-0.001)).toBe('0.0%');
});
