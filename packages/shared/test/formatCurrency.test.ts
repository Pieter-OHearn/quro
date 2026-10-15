/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { formatCurrency, formatNumber, formatUnitPrice } from '../src/utils/index';

test('formats currency values with cents by default', () => {
  expect(formatCurrency(1234, 'EUR')).toBe('€1,234.00');
});

test('still supports opting out of cents explicitly', () => {
  expect(formatCurrency(1234, 'EUR', false)).toBe('€1,234');
});

test('supports European number formatting when requested', () => {
  expect(formatCurrency(1234, 'EUR', true, 'de-DE')).toBe('1.234,00 €');
  expect(
    formatNumber(1234, 'de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  ).toBe('1.234,00');
});

test('formats unit prices with two to four decimals', () => {
  expect(formatUnitPrice(123.4567, 'EUR')).toBe('€123.4567');
  expect(formatUnitPrice(123.45, 'EUR')).toBe('€123.45');
  expect(formatUnitPrice(0.5, 'EUR')).toBe('€0.50');
  expect(formatUnitPrice(12.345678, 'USD')).toBe('$12.3457');
  expect(formatUnitPrice(1234.5, 'EUR', 'de-DE')).toBe('1.234,50\u00a0€');
  expect(formatUnitPrice(0.123456, 'EUR', 'de-DE')).toBe('0,1235\u00a0€');
});
