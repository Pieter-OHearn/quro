/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { formatCurrency, formatNumber } from '../src/utils/index';

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
